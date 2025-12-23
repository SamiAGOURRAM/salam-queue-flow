
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { patientService } from "@/services/patient";
import { staffService, StaffProfile } from "@/services/staff";
import { clinicService } from "@/services/clinic";
import { queueService } from "@/services/queue";
import { useQueueService } from "@/hooks/useQueueService";
import { logger } from "@/services/shared/logging/Logger";

// Appointment types are fetched from clinic settings, no hardcoded defaults

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
}: BookAppointmentDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState<Date | undefined>(preselectedDate ?? (isWalkIn ? new Date() : undefined));
  const [time, setTime] = useState("");
  const [appointmentType, setAppointmentType] = useState<string>("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Staff selection
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  
  // Clinic settings and slots
  const [clinicSettings, setClinicSettings] = useState<any>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  
  // Initialize queue service
  const { createAppointment } = useQueueService({ staffId: selectedStaffId || undefined });

  // Update date when preselectedDate changes
  useEffect(() => {
    if (preselectedDate) {
      setDate(preselectedDate);
    }
  }, [preselectedDate]);

  // Prefill patient info when provided
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

  // Fetch clinic settings
  useEffect(() => {
    const fetchClinicSettings = async () => {
      if (!clinicId || !open) return;
      try {
        const clinic = await clinicService.getClinic(clinicId);
        setClinicSettings(clinic.settings);
        
        // Auto-select first appointment type if available
        if (clinic.settings.appointmentTypes && clinic.settings.appointmentTypes.length > 0 && !appointmentType) {
          setAppointmentType(clinic.settings.appointmentTypes[0].name);
        }
      } catch (error) {
        logger.error('Failed to fetch clinic settings', error instanceof Error ? error : new Error(String(error)), { clinicId });
      }
    };
    fetchClinicSettings();
  }, [clinicId, open, appointmentType]);

  // Fetch doctor/staff for clinic (one doctor per clinic assumption)
  useEffect(() => {
    const fetchDoctor = async () => {
      if (!clinicId || !open) return;
      try {
        const staff = await staffService.getStaffByClinic(clinicId);
        // For now: one doctor per clinic assumption
        // Future: can extend to support multiple resources (doctors, beds, etc.)
        if (staff.length > 0) {
          const preferred = defaultStaffId ? staff.find(s => s.id === defaultStaffId) : null;
          setSelectedStaffId(preferred ? preferred.id : staff[0].id);
          // Keep staff list for future multi-doctor support, but don't show in UI
          setStaffList(staff);
        } else {
          logger.warn('No staff found for clinic', { clinicId });
          toast({
            title: "Configuration Error",
            description: "No staff member found for this clinic. Please contact the clinic.",
            variant: "destructive",
          });
        }
      } catch (error) {
        logger.error('Failed to fetch staff', error instanceof Error ? error : new Error(String(error)), { clinicId });
        toast({
          title: "Error",
          description: "Failed to load clinic staff information.",
          variant: "destructive",
        });
      }
    };
    fetchDoctor();
  }, [clinicId, open, toast, defaultStaffId]);

  // Fetch booked slots when date or staff changes
  const fetchBookedSlots = useCallback(async () => {
    if (!clinicId || !date || !open) {
      setBookedSlots([]);
      return;
    }

    setIsLoadingSlots(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const bookedSlotsData = await queueService.getClinicBookedSlots(clinicId, dateStr);
      
      // Convert to HH:MM format for comparison
      const bookedTimes = bookedSlotsData
        .filter(slot => slot.startTime)
        .map(slot => {
          const slotDate = new Date(slot.startTime);
          return `${String(slotDate.getHours()).padStart(2, "0")}:${String(slotDate.getMinutes()).padStart(2, "0")}`;
        });
      
      setBookedSlots(bookedTimes);
    } catch (error) {
      logger.error('Failed to fetch booked slots', error instanceof Error ? error : new Error(String(error)), { clinicId, date });
      setBookedSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [clinicId, date, open]);

  useEffect(() => {
    fetchBookedSlots();
  }, [fetchBookedSlots]);

  // Reset time when date or appointment type changes
  useEffect(() => {
    setTime("");
  }, [date, appointmentType]);

  // Get appointment types from clinic settings (same logic as BookingFlow)
  const getAppointmentTypes = () => {
    if (!clinicSettings?.appointmentTypes || clinicSettings.appointmentTypes.length === 0) {
      // Use only valid database enum values as fallback
      return [
        { name: "consultation", label: "Consultation", duration: 15 },
        { name: "follow_up", label: "Follow-up", duration: 10 },
        { name: "procedure", label: "Procedure", duration: 30 },
        { name: "emergency", label: "Emergency", duration: 20 },
      ];
    }
    return clinicSettings.appointmentTypes;
  };

  // Generate available time slots based on clinic settings (EXACT same logic as BookingFlow)
  // This matches the exact implementation in BookingFlow.tsx line 216-266
  const generateTimeSlots = (): string[] => {
    // Access settings with snake_case (same as BookingFlow which uses clinic.settings)
    // The settings JSONB field uses snake_case keys
    const settings = clinicSettings as any;
    const workingHours = settings?.working_hours || settings?.workingHours;
    if (!workingHours || !date) return [];

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[date.getDay()];
    const daySchedule = workingHours[dayName];

    if (!daySchedule || daySchedule.closed) return [];

    // EXACT same as BookingFlow line 225-226
    const openTime = daySchedule.open || "09:00";
    const closeTime = daySchedule.close || "18:00";
    
    // EXACT same as BookingFlow line 228-231
    const appointmentTypesArray = settings?.appointment_types || settings?.appointmentTypes || getAppointmentTypes();
    const selectedTypeData = appointmentTypesArray.find((t: any) => t.name === appointmentType);
    const averageDuration = settings?.average_appointment_duration || settings?.averageAppointmentDuration;
    const duration = selectedTypeData?.duration || averageDuration || 15;
    const bufferTime = settings?.buffer_time || settings?.bufferTime || 0;
    const slotInterval = duration + bufferTime;

    // EXACT same slot generation logic as BookingFlow line 233-249
    const slots: string[] = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    let currentHour = openHour;
    let currentMinute = openMinute;

    while (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
      const timeString = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
      slots.push(timeString);

      currentMinute += slotInterval;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    // EXACT same past-time filtering logic as BookingFlow line 251-262
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      
      return slots.filter(timeSlot => {
        const [slotHour, slotMinute] = timeSlot.split(":").map(Number);
        const slotTimeInMinutes = slotHour * 60 + slotMinute;
        return slotTimeInMinutes > currentTimeInMinutes + 15;
      });
    }

    return slots;
  };

  // Filter out booked slots
  const timeSlots = generateTimeSlots();
  const availableTimeSlots = timeSlots.filter(slot => !bookedSlots.includes(slot));

  const handleSubmit = async () => {
    if (!fullName || !phone || !date || !time) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!selectedStaffId) {
      toast({
        title: "Error",
        description: "Please select a staff member",
        variant: "destructive",
      });
      return;
    }

    // Validate slot is available
    if (!availableTimeSlots.includes(time)) {
      toast({
        title: "Slot not available",
        description: "The selected time slot is no longer available. Please choose another time.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if patient exists using PatientService
      // Note: For booked appointments, we prefer registered users over guests
    let patientId: string | undefined = prefillPatient?.patientId;
      
    if (!patientId) {
      const patientResult = await patientService.findOrCreatePatient(phone, fullName);
      
      if (patientResult.patientId) {
        patientId = patientResult.patientId;
      } else {
        const tempEmail = `${phone.replace(/\+/g, '')}@scheduled.temp`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: tempEmail,
          password: Math.random().toString(36).slice(-12),
          options: {
            data: {
              full_name: fullName,
              phone_number: phone,
              role: 'patient'
            }
          }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Failed to create user");

        patientId = authData.user.id;
      }
    }

      // Create appointment using QueueService
      const appointmentDate = format(date, "yyyy-MM-dd");
      const [hours, minutes] = time.split(':');
      const startDateTime = new Date(date);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Calculate end time based on appointment type duration (same logic as slot generation)
      const appointmentTypes = getAppointmentTypes();
      const selectedTypeData = appointmentTypes.find(t => t.name === appointmentType);
      const duration = selectedTypeData?.duration || clinicSettings?.averageAppointmentDuration || 15;
      
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + duration);

      await createAppointment({
        clinicId,
        staffId: selectedStaffId,
        patientId: patientId!,
        guestPatientId: null,
        isGuest: false,
        appointmentType: appointmentType as any, // Type assertion since clinic can define custom types
        isWalkIn,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        reasonForVisit: reason,
      });

      toast({
        title: "Success",
        description: `Appointment booked for ${fullName}`,
      });

      // Reset form
      setFullName("");
      setPhone("");
      setDate(preselectedDate || undefined);
      setTime("");
      // Reset appointment type to first available type
      const types = getAppointmentTypes();
      setAppointmentType(types.length > 0 ? types[0].name : "");
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to book appointment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const dialogTitle = title || (isWalkIn ? "Add Walk-in Patient" : "Book Appointment for Patient");
  const dialogDescription = description || (isWalkIn ? "Schedule a patient who arrived without a prior booking." : "Schedule an appointment for a patient by entering their details");

  // Shared input class for premium design
  const inputClass = "h-10 rounded-[4px] border-border/60 focus:border-foreground/40 transition-colors";
  const selectTriggerClass = "h-10 rounded-[4px] border-border/60";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-[8px] p-0 gap-0">
        {/* Premium Header */}
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
          {/* Patient Info Section */}
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

          {/* Appointment Details Section */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Appointment Details</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
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
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Appointment Type */}
              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs text-muted-foreground">Type *</Label>
                <Select value={appointmentType} onValueChange={setAppointmentType}>
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    {getAppointmentTypes().map((type) => (
                      <SelectItem key={type.name} value={type.name}>
                        {type.label || type.name.replace("_", " ")} ({type.duration} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Time Slot Selection */}
            {date && appointmentType && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Time Slot *</Label>
                  {!isLoadingSlots && availableTimeSlots.length > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">
                      {availableTimeSlots.length} available
                    </span>
                  )}
                </div>
                {isLoadingSlots ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-foreground border-t-transparent"></div>
                    Loading slots...
                  </div>
                ) : availableTimeSlots.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-[4px] text-center">
                    No available slots for this date
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-1">
                    {availableTimeSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTime(slot)}
                        className={cn(
                          "h-9 text-sm font-medium rounded-[4px] transition-all",
                          time === slot
                            ? "bg-foreground text-background"
                            : "bg-muted/50 hover:bg-muted text-foreground"
                        )}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reason */}
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

          {/* Actions */}
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
              disabled={loading || !fullName || !phone || !date || !time} 
              className="flex-1 h-10 rounded-[4px] bg-foreground text-background hover:bg-foreground/90"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                  Booking...
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
