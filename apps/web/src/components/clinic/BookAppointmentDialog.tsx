import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { patientService } from "@/services/patient";
import { staffService, StaffProfile } from "@/services/staff";
import { clinicService } from "@/services/clinic";
import type { ClinicSettings } from "@/services/clinic";
import { bookingService } from "@/services/booking/BookingService";
import type { BookingSlot } from "@/services/booking/types";
import { QueueMode } from "@/services/booking/types";
import { QueueService } from "@/services/queue/QueueService";
import { logger } from "@/services/shared/logging/Logger";

interface PrefillPatientInfo {
  patientId?: string;
  fullName?: string;
  phoneNumber?: string;
}

interface BookAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSuccess: () => void;
  preselectedDate?: Date;
  prefillPatient?: PrefillPatientInfo;
  defaultAppointmentType?: string;
  defaultReason?: string;
  defaultStaffId?: string;
  isWalkIn?: boolean;
  title?: string;
  description?: string;
  allowedStaffIds?: string[];
  performedBy?: string;
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  clinicId,
  onSuccess,
  preselectedDate,
  prefillPatient,
  defaultAppointmentType,
  defaultReason,
  defaultStaffId,
  isWalkIn = false,
  title,
  description,
  allowedStaffIds,
  performedBy,
}: BookAppointmentDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState<Date | undefined>(preselectedDate ?? (isWalkIn ? new Date() : undefined));
  const [time, setTime] = useState("");
  const [appointmentType, setAppointmentType] = useState<string>("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<BookingSlot[]>([]);
  const [queueMode, setQueueMode] = useState<QueueMode | null>(null);
  const [hybridBookingLane, setHybridBookingLane] = useState<'slotted' | 'overflow'>('slotted');
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [urgentInsertion, setUrgentInsertion] = useState(false);
  const [urgentPosition, setUrgentPosition] = useState("1");
  const [isApplyingPriorityOverride, setIsApplyingPriorityOverride] = useState(false);

  const isFluidMode = queueMode === QueueMode.FLUID;
  const isHybridMode = queueMode === QueueMode.HYBRID;
  const requiresTimeSlot =
    queueMode === QueueMode.SLOTTED ||
    (isHybridMode && hybridBookingLane === 'slotted');
  const availableSlotCount = availableTimeSlots.filter((slot) => slot.available).length;
  const bookedSlotCount = availableTimeSlots.filter((slot) => !slot.available).length;

  const availableAppointmentTypes = useMemo(() => {
    const selectedStaff = staffList.find((member) => member.id === selectedStaffId);
    if (selectedStaff?.appointmentTypesOverride && selectedStaff.appointmentTypesOverride.length > 0) {
      return selectedStaff.appointmentTypesOverride;
    }

    return clinicSettings?.appointment_types ?? [];
  }, [clinicSettings, selectedStaffId, staffList]);

  const getStaffLabel = (staffMember: StaffProfile, index: number) => {
    const role = staffMember.role?.replace(/_/g, " ") || "Doctor";
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    if (staffMember.specialization) {
      return `${roleLabel} - ${staffMember.specialization}`;
    }
    return `${roleLabel} ${index + 1}`;
  };

  useEffect(() => {
    if (preselectedDate) {
      setDate(preselectedDate);
    }
  }, [preselectedDate]);

  useEffect(() => {
    if (open && prefillPatient) {
      if (prefillPatient.fullName) setFullName(prefillPatient.fullName);
      if (prefillPatient.phoneNumber) setPhone(prefillPatient.phoneNumber);
    }
  }, [open, prefillPatient]);

  useEffect(() => {
    if (open && defaultAppointmentType) {
      setAppointmentType(defaultAppointmentType);
    }
  }, [open, defaultAppointmentType]);

  useEffect(() => {
    if (open && defaultReason) {
      setReason(defaultReason);
    }
  }, [open, defaultReason]);

  useEffect(() => {
    if (open && isWalkIn && !preselectedDate) {
      setDate((current) => current ?? new Date());
    }
  }, [open, isWalkIn, preselectedDate]);

  useEffect(() => {
    if (!open) {
      setUrgentInsertion(false);
      setUrgentPosition("1");
      setIsApplyingPriorityOverride(false);
      setHybridBookingLane('slotted');
    }
  }, [open]);

  useEffect(() => {
    if (!isHybridMode) {
      setHybridBookingLane('slotted');
    }
  }, [isHybridMode]);

  useEffect(() => {
    const fetchClinicSettings = async () => {
      if (!clinicId || !open) return;
      try {
        const clinic = await clinicService.getClinic(clinicId);
        setClinicSettings(clinic.settings);
        setQueueMode((clinic.queueMode as QueueMode | null) ?? null);

        if (clinic.settings.appointment_types && clinic.settings.appointment_types.length > 0 && !appointmentType) {
          setAppointmentType(clinic.settings.appointment_types[0].name);
        }
      } catch (error) {
        logger.error("Failed to fetch clinic settings", error instanceof Error ? error : new Error(String(error)), { clinicId });
      }
    };

    fetchClinicSettings();
  }, [clinicId, open, appointmentType]);

  useEffect(() => {
    const fetchStaff = async () => {
      if (!clinicId || !open) return;
      try {
        const staff = await staffService.getStaffByClinic(clinicId);
        const normalizedAllowedStaffIds = Array.from(
          new Set((allowedStaffIds || []).filter((id): id is string => typeof id === "string" && id.length > 0))
        );
        const allowedStaffIdSet = new Set(normalizedAllowedStaffIds);

        const scopedStaff = normalizedAllowedStaffIds.length > 0
          ? staff.filter((member) => allowedStaffIdSet.has(member.id))
          : staff;

        setStaffList(scopedStaff);

        if (scopedStaff.length === 0) {
          setSelectedStaffId(null);
          logger.warn("No provider available for booking scope", {
            clinicId,
            allowedStaffCount: normalizedAllowedStaffIds.length,
          });
          toast({
            title: "Configuration Error",
            description: normalizedAllowedStaffIds.length > 0
              ? "No assigned provider is available for this queue scope."
              : "No staff member found for this clinic. Please contact the clinic.",
            variant: "destructive",
          });
          return;
        }

        const preferred = defaultStaffId ? scopedStaff.find((s) => s.id === defaultStaffId) : null;
        setSelectedStaffId(preferred ? preferred.id : scopedStaff[0].id);
      } catch (error) {
        logger.error("Failed to fetch staff", error instanceof Error ? error : new Error(String(error)), { clinicId });
        toast({
          title: "Error",
          description: "Failed to load clinic staff information.",
          variant: "destructive",
        });
      }
    };

    fetchStaff();
  }, [clinicId, open, toast, defaultStaffId, allowedStaffIds]);

  useEffect(() => {
    if (availableAppointmentTypes.length === 0) {
      if (appointmentType) {
        setAppointmentType("");
      }
      return;
    }

    if (!availableAppointmentTypes.some((type) => type.name === appointmentType)) {
      setAppointmentType(availableAppointmentTypes[0].name);
    }
  }, [appointmentType, availableAppointmentTypes]);

  useEffect(() => {
    const fetchSlotsForMode = async () => {
      if (!clinicId || !selectedStaffId || !date || !appointmentType || !open) {
        setAvailableTimeSlots([]);
        return;
      }

      setIsLoadingSlots(true);
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const slotsResponse = await bookingService.getAvailableSlotsForMode(
          clinicId,
          dateStr,
          appointmentType,
          selectedStaffId,
        );

        setQueueMode(slotsResponse.mode ?? null);
        setAvailableTimeSlots(
          (slotsResponse.slots || []).map((slot) => ({
            time: slot.time,
            available: slot.available !== false,
          }))
        );
      } catch (error) {
        logger.error("Failed to fetch mode-aware slots", error instanceof Error ? error : new Error(String(error)), {
          clinicId,
          selectedStaffId,
          date,
          appointmentType,
        });
        setAvailableTimeSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlotsForMode();
  }, [clinicId, selectedStaffId, date, appointmentType, open]);

  useEffect(() => {
    setTime("");
  }, [date, appointmentType, selectedStaffId]);

  useEffect(() => {
    if (!time) return;
    const selectedSlot = availableTimeSlots.find((slot) => slot.time === time);
    if (!selectedSlot || !selectedSlot.available) {
      setTime("");
    }
  }, [availableTimeSlots, time]);

  const handleSubmit = async () => {
    if (isLoadingSlots) {
      toast({
        title: "Please wait",
        description: "Loading queue availability for the selected date.",
        variant: "destructive",
      });
      return;
    }

    if (!fullName || !phone || !date || !appointmentType || !selectedStaffId || (requiresTimeSlot && !time)) {
      toast({
        title: "Missing information",
        description: requiresTimeSlot
          ? "Please fill in all required fields, including doctor and time slot"
          : "Please fill in all required fields, including doctor",
        variant: "destructive",
      });
      return;
    }

    const selectedSlot = availableTimeSlots.find((slot) => slot.time === time);
    if (requiresTimeSlot && (!selectedSlot || !selectedSlot.available)) {
      toast({
        title: "Slot not available",
        description: "The selected time slot is no longer available. Please choose another time.",
        variant: "destructive",
      });
      return;
    }

    const parsedUrgentPosition = Number(urgentPosition);
    if (isWalkIn && urgentInsertion && (!Number.isInteger(parsedUrgentPosition) || parsedUrgentPosition < 1)) {
      toast({
        title: "Invalid urgent position",
        description: "Urgent insertion requires a queue position greater than zero.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const configuredTypes = availableAppointmentTypes;
      const selectedTypeData = configuredTypes.find((type) => type.name === appointmentType);
      if (!selectedTypeData) {
        throw new Error("Clinic appointment types are not configured.");
      }

      let patientId: string | undefined = prefillPatient?.patientId;

      if (!patientId) {
        const patientResult = await patientService.findOrCreatePatient(phone, fullName);

        if (patientResult.patientId) {
          patientId = patientResult.patientId;
        } else {
          const tempEmail = `${phone.replace(/\+/g, "")}@scheduled.temp`;
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: tempEmail,
            password: Math.random().toString(36).slice(-12),
            options: {
              data: {
                full_name: fullName,
                phone_number: phone,
                role: "patient",
              },
            },
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error("Failed to create user");

          patientId = authData.user.id;
        }
      }

      const appointmentDate = format(date, "yyyy-MM-dd");
      const bookingResult = await bookingService.bookAppointmentForMode({
        clinicId,
        patientId: patientId!,
        staffId: selectedStaffId,
        appointmentDate,
        scheduledTime: requiresTimeSlot ? time : null,
        appointmentType: appointmentType as any,
        reasonForVisit: reason,
      });

      if (!bookingResult.success) {
        throw new Error(bookingResult.error || "Failed to book appointment");
      }

      let overrideWarning: string | null = null;

      if (isWalkIn && urgentInsertion && bookingResult.appointmentId) {
        if (!performedBy) {
          overrideWarning = "Appointment was booked, but urgent insertion requires an authenticated staff user.";
        } else {
          setIsApplyingPriorityOverride(true);
          try {
            const queueService = new QueueService();
            await queueService.reorderQueue({
              appointmentId: bookingResult.appointmentId,
              newPosition: parsedUrgentPosition,
              performedBy,
              reason: 'Urgent walk-in insertion override',
              allowedStaffIds,
            });
          } catch (priorityError) {
            overrideWarning =
              priorityError instanceof Error
                ? priorityError.message
                : 'The appointment was booked, but urgent insertion could not be applied.';
            logger.error(
              "Urgent walk-in insertion override failed",
              priorityError instanceof Error ? priorityError : new Error(String(priorityError)),
              {
                clinicId,
                appointmentId: bookingResult.appointmentId,
                requestedPosition: parsedUrgentPosition,
              }
            );
          } finally {
            setIsApplyingPriorityOverride(false);
          }
        }
      }

      const queuePositionText = bookingResult.queuePosition
        ? ` Queue position #${bookingResult.queuePosition}.`
        : "";

      const queuedWithoutSlot = isFluidMode || (isHybridMode && !requiresTimeSlot);

      toast({
        title: "Success",
        description: queuedWithoutSlot
          ? `${fullName} added to queue.${queuePositionText}`
          : `Appointment booked for ${fullName}.${queuePositionText}`,
      });

      if (overrideWarning) {
        toast({
          title: "Booked with warning",
          description: overrideWarning,
          variant: "destructive",
        });
      }

      setFullName("");
      setPhone("");
      setDate(preselectedDate || undefined);
      setTime("");
      const types = availableAppointmentTypes;
      setAppointmentType(types[0]?.name || "");
      setReason("");
      setUrgentInsertion(false);
      setUrgentPosition("1");
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to book appointment",
        variant: "destructive",
      });
    } finally {
      setIsApplyingPriorityOverride(false);
      setLoading(false);
    }
  };

  const dialogTitle = title || (isWalkIn ? "Add Walk-in Patient" : "Book Appointment for Patient");
  const dialogDescription = description || (isWalkIn
    ? "Schedule a patient who arrived without a prior booking."
    : "Schedule an appointment for a patient by entering their details");

  const inputClass = "h-10 rounded-[4px] border-border/60 focus:border-foreground/40 transition-colors";
  const selectTriggerClass = "h-10 rounded-[4px] border-border/60";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-[8px] p-0 gap-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[4px] bg-foreground flex items-center justify-center flex-shrink-0">
              <CalendarIcon className="w-5 h-5 text-background" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">{dialogTitle}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                {dialogDescription}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Patient Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs text-muted-foreground">Full Name *</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmed Hassan"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 XXX XXX XXX"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Appointment Details</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        inputClass,
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-[4px]" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(candidateDate) => candidateDate < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs text-muted-foreground">Type *</Label>
                <Select value={appointmentType} onValueChange={setAppointmentType}>
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    {availableAppointmentTypes.map((type) => (
                      <SelectItem key={type.name} value={type.name}>
                        {type.label || type.name.replace("_", " ")} ({type.duration} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff" className="text-xs text-muted-foreground">Doctor *</Label>
              <Select
                value={selectedStaffId || undefined}
                onValueChange={(value) => setSelectedStaffId(value)}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent className="rounded-[4px]">
                  {staffList.map((staffMember, index) => (
                    <SelectItem key={staffMember.id} value={staffMember.id}>
                      {getStaffLabel(staffMember, index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {date && appointmentType && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {isFluidMode || (isHybridMode && !requiresTimeSlot) ? "Queue Mode" : "Time Slot *"}
                  </Label>
                  {!isLoadingSlots && !isFluidMode && requiresTimeSlot && availableTimeSlots.length > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">
                      {availableSlotCount} available{bookedSlotCount > 0 ? ` • ${bookedSlotCount} booked` : ""}
                    </span>
                  )}
                </div>
                {isHybridMode && selectedStaffId && !isLoadingSlots && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={hybridBookingLane === 'slotted' ? 'default' : 'outline'}
                      onClick={() => setHybridBookingLane('slotted')}
                      className="h-8 text-xs"
                    >
                      Book with Time Slot
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={hybridBookingLane === 'overflow' ? 'default' : 'outline'}
                      onClick={() => setHybridBookingLane('overflow')}
                      className="h-8 text-xs"
                    >
                      Overflow Queue
                    </Button>
                  </div>
                )}
                {!selectedStaffId ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-[4px]">
                    Select a doctor to view availability.
                  </div>
                ) : isLoadingSlots ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-foreground border-t-transparent"></div>
                    Loading availability...
                  </div>
                ) : isFluidMode ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-[4px]">
                    No fixed time slots in fluid mode. This patient will join the FIFO queue for the selected date.
                  </div>
                ) : isHybridMode && hybridBookingLane === 'overflow' ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-[4px]">
                    Hybrid overflow lane selected. This patient will join the no-time queue while timed slots remain available for scheduled bookings.
                  </div>
                ) : availableTimeSlots.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-[4px] text-center">
                    No available slots for this date
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-1">
                    {availableTimeSlots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => {
                          if (!slot.available) return;
                          setTime(slot.time);
                        }}
                        disabled={!slot.available}
                        className={cn(
                          "h-10 text-sm font-medium rounded-[4px] transition-all border",
                          time === slot.time && slot.available
                            ? "bg-foreground text-background"
                            : slot.available
                              ? "bg-muted/50 hover:bg-muted text-foreground border-transparent"
                              : "bg-muted/30 text-muted-foreground border-border/70 cursor-not-allowed"
                        )}
                      >
                        <span className="block leading-none">{slot.time}</span>
                        {!slot.available && <span className="mt-0.5 block text-[10px] uppercase tracking-wide">Booked</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isWalkIn && (
              <div className="space-y-3 rounded-[4px] border border-amber-200/80 bg-amber-50/60 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="urgentInsertion"
                    checked={urgentInsertion}
                    onCheckedChange={(checked) => setUrgentInsertion(checked === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="urgentInsertion" className="text-xs text-amber-900">
                      Urgent walk-in insertion
                    </Label>
                    <p className="text-xs text-amber-800/90">
                      Move this patient to a specific queue position right after booking.
                    </p>
                  </div>
                </div>

                {urgentInsertion && (
                  <div className="space-y-1.5">
                    <Label htmlFor="urgentPosition" className="text-xs text-muted-foreground">
                      Insert at queue position *
                    </Label>
                    <Input
                      id="urgentPosition"
                      type="number"
                      min={1}
                      step={1}
                      value={urgentPosition}
                      onChange={(event) => setUrgentPosition(event.target.value)}
                      placeholder="1"
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs text-muted-foreground">Reason for Visit (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief description..."
              rows={2}
              className="rounded-[4px] border-border/60 focus:border-foreground/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-10 rounded-[4px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                loading ||
                isApplyingPriorityOverride ||
                isLoadingSlots ||
                !fullName ||
                !phone ||
                !date ||
                !appointmentType ||
                !selectedStaffId ||
                (requiresTimeSlot && !time)
              }
              className="flex-1 h-10 rounded-[4px] bg-foreground text-background hover:bg-foreground/90"
            >
              {loading || isApplyingPriorityOverride ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                  {isApplyingPriorityOverride ? "Applying Priority..." : "Booking..."}
                </span>
              ) : (
                "Book Appointment"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
