import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { clinicService } from "@/services/clinic";
import { queueService } from "@/services/queue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Info, Users, ArrowRight, ArrowLeft } from "lucide-react";
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

const ACTIVE_STATUSES = ["scheduled", "waiting", "in_progress"] as const;

const BookingFlow = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Get staff ID for queue service (will be set when we fetch staff)
  const [staffId, setStaffId] = useState<string | undefined>(undefined);
  const { createAppointment } = useQueueService({ staffId });

  // UI State
  const [step, setStep] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Data State
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Booking Form State
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [reason, setReason] = useState("");

  // Result State
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [totalInQueue, setTotalInQueue] = useState<number | null>(null);

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

  const fetchBookedSlots = useCallback(async (date: Date) => {
    if (!clinicId) return;

    setIsLoadingSlots(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");

      const bookedSlotsData = await queueService.getClinicBookedSlots(clinicId, dateStr);

      // Extract time from start_time (timestamp) to UI format (HH:MM)
      const slots = bookedSlotsData.map(slot => {
        // Extract time from timestamp: "2025-11-27T10:00:00+01:00" -> "10:00"
        const timeStr = format(new Date(slot.startTime), "HH:mm");
        return timeStr;
      });

      // Remove duplicates (in case multiple appointments at same time)
      const uniqueSlots = [...new Set(slots)];

      setBookedSlots(uniqueSlots);
    } catch (error) {
      logger.error("Error fetching booked slots", error as Error, { clinicId, date });
      setBookedSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) {
      fetchClinic();
    }
  }, [clinicId, fetchClinic]);

  useEffect(() => {
    if (selectedDate && clinicId) {
      fetchBookedSlots(selectedDate);
    }
  }, [selectedDate, clinicId, fetchBookedSlots]);

  useEffect(() => {
    setSelectedTime("");
  }, [selectedDate, appointmentType]);

  useEffect(() => {
    if (!clinicId || !selectedDate) return;

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
          fetchBookedSlots(selectedDate);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, selectedDate, fetchBookedSlots]);

  const checkSlotAvailability = async (date: Date, time: string): Promise<boolean> => {
    if (!clinicId) return false;

    try {
      const dateStr = format(date, "yyyy-MM-dd");
      // Convert UI time (HH:MM) to database format (HH:MM:SS)
      const timeWithSeconds = time.length === 5 ? `${time}:00` : time;

      logger.debug("Checking slot availability", { clinicId, date: dateStr, time, timeWithSeconds });

      // Get all booked slots for the date
      const bookedSlotsData = await queueService.getClinicBookedSlots(clinicId, dateStr);

      // Build the full datetime string for the selected time
      const fullDateTime = `${dateStr}T${timeWithSeconds}`;
      const selectedTime = new Date(fullDateTime).getTime();

      // Check if any booked slot overlaps with the selected time
      const isBooked = bookedSlotsData.some(slot => {
        const slotTime = new Date(slot.startTime).getTime();
        const oneMinuteLater = slotTime + 60000; // Add 1 minute
        // Check if selected time falls within the slot's time range
        return selectedTime >= slotTime && selectedTime < oneMinuteLater;
      });

      const isAvailable = !isBooked;

      if (!isAvailable) {
        logger.debug("Slot taken", { clinicId, date: dateStr, time });
      } else {
        logger.debug("Slot available", { clinicId, date: dateStr, time });
      }

      return isAvailable;
    } catch (error) {
      logger.error("Error checking slot availability", error instanceof Error ? error : new Error(String(error)), { clinicId, date: format(date, "yyyy-MM-dd"), time });
      return false;
    }
  };

  // ==================== HELPER FUNCTIONS ====================

  const isDayClosed = (date: Date): boolean => {
    if (!clinic?.settings?.working_hours) return false;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[date.getDay()];
    const daySchedule = clinic.settings.working_hours[dayName];

    return daySchedule?.closed === true;
  };

  const generateTimeSlots = (): string[] => {
    if (!clinic?.settings?.working_hours || !selectedDate) return [];

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const daySchedule = clinic.settings.working_hours[dayName];

    if (!daySchedule || daySchedule.closed) return [];

    const openTime = daySchedule.open || "09:00";
    const closeTime = daySchedule.close || "18:00";

    const selectedTypeData = clinic.settings.appointment_types?.find(t => t.name === appointmentType);
    const duration = selectedTypeData?.duration || clinic.settings.average_appointment_duration || 15;
    const bufferTime = clinic.settings.buffer_time || 0;
    const slotInterval = duration + bufferTime;

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

    // Filter out past time slots if today
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

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

  const getAppointmentTypes = () => {
    if (!clinic?.settings?.appointment_types || clinic.settings.appointment_types.length === 0) {
      // Use only valid database enum values
      return [
        { name: "consultation", label: "Consultation", duration: 15 },
        { name: "follow_up", label: "Follow-up", duration: 10 },
        { name: "procedure", label: "Procedure", duration: 30 },
        { name: "emergency", label: "Emergency", duration: 20 },
      ];
    }
    return clinic.settings.appointment_types;
  };

  // ==================== EVENT HANDLERS ====================

  const handleNextStep = () => {
    if (step === 1) {
      if (!selectedDate || !selectedTime || !appointmentType) {
        toast({
          title: "Missing Information",
          description: "Please fill in all appointment details.",
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
      if (!userId) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to book an appointment.",
          variant: "destructive",
        });
        return;
      }

      logger.debug("Starting booking process", {
        date: format(selectedDate!, "yyyy-MM-dd"),
        time: selectedTime,
        appointmentType,
        clinicId
      });

      // Convert time to database format (HH:MM:SS)
      const timeForDB = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;

      // Get clinic staff (using RPC for now, could be refactored to StaffService later)
      const { data: staffData, error: staffError } = await supabase
        .rpc('get_clinic_staff_for_booking', { p_clinic_id: clinicId });

      if (staffError || !staffData || staffData.length === 0) {
        logger.error("Could not find clinic staff", staffError, { clinicId });
        toast({
          title: "Configuration Error",
          description: "Could not find clinic staff. Please contact the clinic.",
          variant: "destructive",
        });
        return;
      }

      const currentStaffId = staffData[0].staff_id;
      setStaffId(currentStaffId); // Update for queue service

      // Final availability check (in case someone else just booked)
      const isSlotAvailable = await checkSlotAvailability(selectedDate!, selectedTime);

      if (!isSlotAvailable) {
        logger.warn("Slot was taken between selection and booking", { clinicId, date: format(selectedDate!, "yyyy-MM-dd"), time: selectedTime });
        toast({
          title: "Time Slot No Longer Available",
          description: "This time slot was just booked by another patient. Please select a different time.",
          variant: "destructive",
        });
        // Refresh the booked slots
        await fetchBookedSlots(selectedDate!);
        setStep(1);
        setSelectedTime("");
        return;
      }

      logger.debug("Slot is available, creating appointment", { clinicId, date: format(selectedDate!, "yyyy-MM-dd"), time: selectedTime });

      // Convert date and time to ISO format for QueueService
      const appointmentDate = format(selectedDate!, "yyyy-MM-dd");
      const [hours, minutes] = selectedTime.split(':');
      const startDateTime = new Date(selectedDate!);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Get appointment duration from clinic settings or default to 15 minutes
      const duration = clinic?.settings?.average_appointment_duration || 15;
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + duration);

      logger.debug("Creating appointment via QueueService", {
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        appointmentType,
        clinicId,
        userId
      });

      // Validate appointmentType is a valid enum value
      // Valid values: consultation, follow_up, emergency, procedure, vaccination, screening
      const validAppointmentTypes = ['consultation', 'follow_up', 'emergency', 'procedure', 'vaccination', 'screening'];
      const validatedAppointmentType = validAppointmentTypes.includes(appointmentType)
        ? appointmentType
        : 'consultation'; // Default fallback

      // Use QueueService to create appointment
      const newAppointment = await createAppointment({
        clinicId: clinicId!,
        staffId: currentStaffId,
        patientId: userId,
        guestPatientId: null,
        isGuest: false,
        appointmentType: validatedAppointmentType as any, // Cast to enum type
        isWalkIn: false,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        reasonForVisit: reason || undefined,
      });

      if (!newAppointment) {
        throw new Error("Failed to create appointment");
      }

      logger.info("Booking successful", {
        appointmentId: newAppointment.id,
        clinicId,
        userId,
        queuePosition: newAppointment.queuePosition
      });

      // Get queue information for display
      setQueuePosition(newAppointment.queuePosition || null);

      // Count total appointments in queue for this day
      const { count } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("appointment_date", appointmentDate)
        .in("status", ACTIVE_STATUSES);

      setTotalInQueue(count || 0);

      setStep(3);
      toast({
        title: "Booking Confirmed!",
        description: "Your appointment has been successfully booked.",
      });

    } catch (error: unknown) {
      logger.error("Booking failed", error instanceof Error ? error : new Error(String(error)), { clinicId, userId, date: format(selectedDate!, "yyyy-MM-dd"), time: selectedTime });
      const description =
        error instanceof Error
          ? error.message
          : "Failed to book appointment. Please try again.";
      toast({
        title: "Booking Failed",
        description,
        variant: "destructive",
      });
    }
  };

  // ==================== COMPUTED VALUES ====================

  const appointmentTypes = getAppointmentTypes();
  const timeSlots = generateTimeSlots();

  // Filter out booked slots from available time slots
  const availableTimeSlots = timeSlots.filter(time => !bookedSlots.includes(time));

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
                        Select Time
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

                      {appointmentType && availableTimeSlots.length === 0 && !isLoadingSlots && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>No slots available. Try another day.</span>
                        </div>
                      )}

                      {appointmentType && availableTimeSlots.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                              {availableTimeSlots.length} available
                            </span>
                            {bookedSlots.length > 0 && (
                              <span className="text-gray-400">
                                {bookedSlots.length} booked
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
                  disabled={!selectedDate || !selectedTime || !appointmentType}
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
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")} at {selectedTime}
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
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                        {" "}({appointmentTypes.find(t => t.name === appointmentType)?.duration} min)
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
                      <span className="font-medium text-gray-900">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => navigate("/clinics")}
                    className="h-10 px-5 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
                  >
                    Browse Clinics
                  </Button>
                  {user && (
                    <Button
                      variant="outline"
                      onClick={() => navigate("/patient/dashboard")}
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
