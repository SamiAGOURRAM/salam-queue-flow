import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { bookingService } from "@/services/booking/BookingService";
import { QueueMode } from "@/services/queue/models/QueueModels";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Info, Users, ArrowRight, ArrowLeft, User } from "lucide-react";
import { format, startOfDay } from "date-fns";
import AuthModal from "@/components/auth/AuthModal";
import { logger } from "@/services/shared/logging/Logger";

interface Clinic {
  id: string;
  name: string;
  specialty: string;
  settings: {
    buffer_time?: number;
    working_hours?: {
      [key: string]: {
        open?: string;
        close?: string;
        closed?: boolean;
      };
    };
    appointment_types?: Array<{
      name: string;
      label: string;
      duration: number;
    }>;
    average_appointment_duration?: number;
  };
}

interface DoctorOption {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  specialization?: string;
}

const BookingFlow = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const preselectedStaffId = searchParams.get("staffId") || "";

  // UI State
  const [step, setStep] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Data State
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [queueMode, setQueueMode] = useState<QueueMode | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [totalSlotCount, setTotalSlotCount] = useState(0);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Booking Form State
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [reason, setReason] = useState("");

  // Result State
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  const fetchClinic = useCallback(async () => {
    if (!clinicId) return;
    try {
      const clinicData = await clinicService.getClinic(clinicId);

      // Map to component's expected format
      setClinic({
        id: clinicData.id,
        name: clinicData.name,
        specialty: clinicData.specialty,
        settings: clinicData.settings,
      } as Clinic);
    } catch (error) {
      logger.error("Error fetching clinic", error instanceof Error ? error : new Error(String(error)), { clinicId });
      toast({
        title: "Error",
        description: "Failed to load clinic information.",
        variant: "destructive",
      });
    }
  }, [clinicId, toast]);

  const fetchDoctors = useCallback(async () => {
    if (!clinicId) return;

    try {
      const clinicStaff = await staffService.getStaffByClinic(clinicId);

      const doctorOptions = await Promise.all(
        clinicStaff.map(async (member, index) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", member.userId)
            .maybeSingle();

          const fallbackName = member.specialization
            ? `${member.specialization} Specialist`
            : `Doctor ${index + 1}`;

          return {
            id: member.id,
            userId: member.userId,
            fullName: profile?.full_name || fallbackName,
            role: member.role,
            specialization: member.specialization,
          } as DoctorOption;
        })
      );

      setDoctors(doctorOptions);

      setSelectedStaffId((currentStaffId) => {
        if (preselectedStaffId && doctorOptions.some((doctor) => doctor.id === preselectedStaffId)) {
          return preselectedStaffId;
        }

        if (currentStaffId && doctorOptions.some((doctor) => doctor.id === currentStaffId)) {
          return currentStaffId;
        }

        return doctorOptions[0]?.id || "";
      });
    } catch (error) {
      logger.error("Error fetching clinic doctors", error instanceof Error ? error : new Error(String(error)), { clinicId });
      setDoctors([]);
      setSelectedStaffId("");
      toast({
        title: "Error",
        description: "Failed to load doctors for this clinic.",
        variant: "destructive",
      });
    }
  }, [clinicId, preselectedStaffId, toast]);

  const fetchAvailableSlots = useCallback(async (date: Date, type: string, staffId: string) => {
    if (!clinicId || !type || !staffId) {
      setQueueMode(null);
      setAvailableSlots([]);
      setTotalSlotCount(0);
      return;
    }

    setIsLoadingSlots(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const slotsResponse = await bookingService.getAvailableSlotsForMode(clinicId, dateStr, type, staffId);
      setQueueMode(slotsResponse.mode ?? null);
      const slots = Array.isArray(slotsResponse.slots) ? slotsResponse.slots : [];

      const normalizedAvailable = slots
        .filter((slot) => slot.available)
        .map((slot) => (slot.time.length >= 5 ? slot.time.slice(0, 5) : slot.time));

      setAvailableSlots([...new Set(normalizedAvailable)]);
      setTotalSlotCount(slots.length);
    } catch (error) {
      logger.error("Error fetching available slots", error as Error, { clinicId, date, appointmentType: type, staffId });
      setQueueMode(null);
      setAvailableSlots([]);
      setTotalSlotCount(0);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) {
      fetchClinic();
      fetchDoctors();
    }
  }, [clinicId, fetchClinic, fetchDoctors]);

  useEffect(() => {
    if (selectedDate && clinicId && appointmentType && selectedStaffId) {
      fetchAvailableSlots(selectedDate, appointmentType, selectedStaffId);
      return;
    }

    setQueueMode(null);
    setAvailableSlots([]);
    setTotalSlotCount(0);
  }, [selectedDate, clinicId, appointmentType, selectedStaffId, fetchAvailableSlots]);

  useEffect(() => {
    setSelectedTime("");
  }, [selectedDate, appointmentType, selectedStaffId]);

  useEffect(() => {
    if (!clinicId || !selectedDate || !appointmentType || !selectedStaffId) return;

    const channel = supabase
      .channel(`appointments-${clinicId}-${format(selectedDate, "yyyy-MM-dd")}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          logger.debug("Real-time appointment change", { event: payload.eventType, clinicId });
          fetchAvailableSlots(selectedDate, appointmentType, selectedStaffId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, selectedDate, appointmentType, selectedStaffId, fetchAvailableSlots]);

  // ==================== HELPER FUNCTIONS ====================

  const isDayClosed = (date: Date): boolean => {
    if (!clinic?.settings?.working_hours) return false;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[date.getDay()];
    const daySchedule = clinic.settings.working_hours[dayName];

    return daySchedule?.closed === true;
  };

  const getAppointmentTypes = () => {
    return clinic?.settings?.appointment_types ?? [];
  };

  const appointmentTypes = getAppointmentTypes();
  const selectedAppointmentType = appointmentTypes.find((type) => type.name === appointmentType);
  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedStaffId) || null;
  const isFluidMode = queueMode === QueueMode.FLUID;
  const requiresTimeSlot = !isFluidMode;
  const availableTimeSlots = availableSlots;

  // ==================== EVENT HANDLERS ====================

  const handleNextStep = () => {
    if (step === 1) {
      if (!selectedStaffId || !selectedDate || !appointmentType || (requiresTimeSlot && !selectedTime)) {
        toast({
          title: "Missing Information",
          description: requiresTimeSlot
            ? "Please fill in all appointment details."
            : "Please select an appointment type and date.",
          variant: "destructive",
        });
        return;
      }

      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      handleSubmitBooking();
    }
  };

  const handleSubmitBooking = async () => {
    try {
      const userId = user?.id;
      if (!userId || !selectedStaffId || !selectedDate || !appointmentType || (requiresTimeSlot && !selectedTime)) {
        toast({
          title: "Missing Information",
          description: "Please complete all booking details before confirming.",
          variant: "destructive",
        });
        return;
      }

      if (requiresTimeSlot && !availableSlots.includes(selectedTime)) {
        toast({
          title: "Time Slot No Longer Available",
          description: "This slot is no longer available. Please select another time.",
          variant: "destructive",
        });
        await fetchAvailableSlots(selectedDate, appointmentType, selectedStaffId);
        setStep(1);
        setSelectedTime("");
        return;
      }

      logger.debug("Starting booking process", {
        date: format(selectedDate, "yyyy-MM-dd"),
        time: requiresTimeSlot ? selectedTime : null,
        appointmentType,
        staffId: selectedStaffId,
        queueMode,
        clinicId
      });

      const selectedType = selectedAppointmentType;
      if (!selectedType) {
        toast({
          title: "Clinic Configuration Missing",
          description: "This clinic has no valid appointment type configuration.",
          variant: "destructive",
        });
        setStep(1);
        return;
      }

      const bookingResult = await bookingService.bookAppointmentForMode({
        clinicId: clinicId!,
        patientId: userId,
        staffId: selectedStaffId,
        appointmentDate: format(selectedDate, "yyyy-MM-dd"),
        scheduledTime: requiresTimeSlot ? selectedTime : null,
        appointmentType: selectedType.name,
        reasonForVisit: reason || undefined,
      });

      if (!bookingResult.success || !bookingResult.appointmentId) {
        const errorMessage = bookingResult.error || "Failed to book appointment.";
        toast({
          title: "Booking Failed",
          description: errorMessage,
          variant: "destructive",
        });
        await fetchAvailableSlots(selectedDate, selectedType.name, selectedStaffId);
        setStep(1);
        setSelectedTime("");
        return;
      }

      logger.info("Booking successful", {
        appointmentId: bookingResult.appointmentId,
        clinicId,
        staffId: selectedStaffId,
        userId: user?.id,
        queuePosition: bookingResult.queuePosition,
        queueMode,
      });

      // Get queue information for display
      setQueuePosition(bookingResult.queuePosition || null);

      setStep(3);
      toast({
        title: "Booking Confirmed!",
        description: "Your appointment has been successfully booked.",
      });

    } catch (error: unknown) {
      logger.error("Booking failed", error instanceof Error ? error : new Error(String(error)), {
        clinicId,
        userId: user?.id,
        date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined,
        time: requiresTimeSlot ? selectedTime : null,
      });
      const description =
        error instanceof Error
          ? error.message
          : "Failed to book appointment. Please try again.";
      toast({
        title: "Booking Failed",
        description,
        variant: "destructive",
      });

      if (selectedDate && appointmentType) {
        await fetchAvailableSlots(selectedDate, appointmentType, selectedStaffId);
      }
    }
  };

  // ==================== RENDER ====================

  return (
    <>
      <div className="min-h-screen bg-[#fafafa] py-8 px-4">
        <div className="max-w-2xl mx-auto">

          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </button>

          {/* Header */}
          {clinic && (
            <header className="mb-6">
              <p className="text-sm text-gray-500 mb-1">Book appointment at</p>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                {clinic.name}
              </h1>
              <p className="text-sm text-gray-500">{clinic.specialty}</p>
            </header>
          )}

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s
                    ? "bg-obsidian text-white"
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`w-8 h-0.5 mx-1 transition-colors ${
                    step > s ? "bg-obsidian" : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Main Card */}
          <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">

            {/* STEP 1: Select Date & Time */}
            {step === 1 && (
              <div className="p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Select Date & Time</h2>
                  <p className="text-sm text-gray-500">Choose your preferred appointment slot</p>
                </div>

                <div className="space-y-5">
                  {/* Doctor */}
                  <div>
                    <Label htmlFor="staff" className="text-sm font-medium text-gray-700 mb-1.5 block">
                      Doctor
                    </Label>
                    <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                      <SelectTrigger className="h-10 border-gray-200 rounded-md text-sm">
                        <SelectValue placeholder="Select doctor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.fullName}
                            {doctor.specialization ? ` - ${doctor.specialization}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {doctors.length === 0 && (
                      <p className="text-xs text-red-600 mt-1.5">
                        No active doctors are available for this clinic.
                      </p>
                    )}
                  </div>

                  {/* Appointment Type */}
                  <div>
                    <Label htmlFor="appointmentType" className="text-sm font-medium text-gray-700 mb-1.5 block">
                      Appointment Type
                    </Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger className="h-10 border-gray-200 rounded-md text-sm">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {appointmentTypes.map((type) => (
                          <SelectItem key={type.name} value={type.name}>
                            {type.label} ({type.duration} min)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {appointmentTypes.length === 0 && (
                      <p className="text-xs text-red-600 mt-1.5">
                        Clinic appointment types are not configured yet.
                      </p>
                    )}
                  </div>

                  {/* Date & Time Grid */}
                  <div className="grid md:grid-cols-2 gap-5">
                    {/* Date Picker */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Select Date</Label>
                      <div className="border border-gray-200 rounded-lg p-3">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => date < startOfDay(new Date()) || isDayClosed(date)}
                          className="rounded-md"
                        />
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        {isFluidMode ? "Queue Mode" : "Select Time"}
                        {isLoadingSlots && (
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            Loading...
                          </span>
                        )}
                      </Label>

                      {!appointmentType && (
                        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-600 text-sm">
                          <Info className="h-4 w-4 flex-shrink-0 text-gray-400" />
                          <span>Select appointment type first</span>
                        </div>
                      )}

                      {appointmentType && isFluidMode && !isLoadingSlots && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
                          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p>Fluid mode has no fixed time slots.</p>
                            <p className="text-xs text-blue-700">
                              You will receive a FIFO queue position after booking.
                              {selectedAppointmentType ? ` Estimated care time: ${selectedAppointmentType.duration} min.` : ""}
                            </p>
                          </div>
                        </div>
                      )}

                      {appointmentType && !isFluidMode && availableTimeSlots.length === 0 && !isLoadingSlots && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>No slots available. Try another day.</span>
                        </div>
                      )}

                      {appointmentType && !isFluidMode && availableTimeSlots.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                              {availableTimeSlots.length} available
                            </span>
                            {totalSlotCount > availableTimeSlots.length && (
                              <span className="text-gray-400">
                                {totalSlotCount - availableTimeSlots.length} unavailable
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                            {availableTimeSlots.map((time) => (
                              <Button
                                key={time}
                                variant={selectedTime === time ? "default" : "outline"}
                                onClick={() => setSelectedTime(time)}
                                className={`h-9 text-xs font-medium rounded-md transition-colors ${
                                  selectedTime === time
                                    ? "bg-obsidian text-white hover:bg-obsidian-hover"
                                    : "border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                {time}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <Label htmlFor="reason" className="text-sm font-medium text-gray-700 mb-1.5 block">
                      Reason for Visit <span className="text-gray-400 font-normal">(Optional)</span>
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly describe your reason for visit..."
                      rows={3}
                      className="resize-none border-gray-200 rounded-md text-sm"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleNextStep}
                  className="w-full h-10 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
                  disabled={!selectedStaffId || !selectedDate || !appointmentType || (requiresTimeSlot && !selectedTime)}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

            {/* STEP 2: Confirm Booking */}
            {step === 2 && (
              <div className="p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Confirm Booking</h2>
                  <p className="text-sm text-gray-500">Review your appointment details</p>
                </div>

                <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-obsidian text-white flex items-center justify-center flex-shrink-0">
                      <CalendarIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Date & Time</p>
                      <p className="text-sm text-gray-600">
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
                        {requiresTimeSlot ? ` at ${selectedTime}` : " (No fixed time - FIFO queue)"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-obsidian text-white flex items-center justify-center flex-shrink-0">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Appointment Type</p>
                      <p className="text-sm text-gray-600 capitalize">
                        {selectedAppointmentType?.label}
                        {" "}({selectedAppointmentType?.duration} min)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-obsidian text-white flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Doctor</p>
                      <p className="text-sm text-gray-600 capitalize">
                        {selectedDoctor?.fullName || "Not selected"}
                      </p>
                    </div>
                  </div>

                  {reason && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-900 mb-1">Reason for Visit</p>
                      <p className="text-sm text-gray-600">{reason}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1 h-10 border-gray-200 text-sm font-medium rounded-md"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmitBooking}
                    className="flex-1 h-10 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
                  >
                    Confirm Booking
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Success */}
            {step === 3 && (
              <div className="p-5 sm:p-6 text-center space-y-5">
                <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">Booking Confirmed!</h2>
                  <p className="text-sm text-gray-500">
                    Your appointment has been successfully booked.
                  </p>
                </div>

                {/* Queue Position */}
                {queuePosition !== null && (
                  <div className="inline-flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="w-10 h-10 rounded-md bg-obsidian flex items-center justify-center">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-gray-500">Queue Position</p>
                      <p className="text-xl font-semibold text-gray-900">#{queuePosition}</p>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-left max-w-sm mx-auto">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Clinic</span>
                      <span className="font-medium text-gray-900">{clinic?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date</span>
                      <span className="font-medium text-gray-900">
                        {selectedDate && format(selectedDate, "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Time</span>
                      <span className="font-medium text-gray-900">
                        {requiresTimeSlot ? selectedTime : "No fixed time (FIFO)"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {selectedAppointmentType?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Doctor</span>
                      <span className="font-medium text-gray-900">{selectedDoctor?.fullName || "Not selected"}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => navigate("/doctors")}
                    className="h-10 px-5 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
                  >
                    Browse Doctors
                  </Button>
                  {user && (
                    <Button
                      variant="outline"
                      onClick={() => navigate("/my-appointments")}
                      className="h-10 px-5 border-gray-200 text-sm font-medium rounded-md"
                    >
                      My Appointments
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          setStep(2);
        }}
      />
    </>
  );
};

export default BookingFlow;
