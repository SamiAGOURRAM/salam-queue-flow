import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { clinicService } from "@/services/clinic";
import { queueService } from "@/services/queue";
import { useBookingService } from "@/hooks/useBookingService";
import { bookingService } from "@/services/booking/BookingService"; 
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, 
  Info, Users, ArrowRight, Loader2, ListOrdered, Timer 
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import AuthModal from "@/components/auth/AuthModal";
import { logger } from "@/services/shared/logging/Logger";

type QueueMode = 'ordinal_queue' | 'time_grid_fixed' | null;

const ACTIVE_STATUSES = ["scheduled", "waiting", "in_progress"] as const;

const BookingFlow = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Get staff ID for queue service (will be set when we fetch staff)
  const [staffId, setStaffId] = useState<string | undefined>(undefined);
  const { createAppointment } = useQueueService({ staffId });

  // State
  const [step, setStep] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [reason, setReason] = useState("");
  const [bookingResult, setBookingResult] = useState<any>(null);
  
  // NEW: Queue mode state
  const [queueMode, setQueueMode] = useState<QueueMode>(null);
  const [loadingMode, setLoadingMode] = useState(false);

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

  // Use the booking service hook with queue mode
  const {
    clinicInfo,
    availableSlots,
    loadingClinic,
    loadingSlots,
    isBooking,
    bookAppointment,
    refetchSlots
  } = useBookingService(clinicId, selectedDate, appointmentType, queueMode);

  // NEW: Fetch queue mode when date or clinic changes
  useEffect(() => {
    const fetchQueueMode = async () => {
      if (!clinicId || !selectedDate) return;

      setLoadingMode(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        console.log('📅 DATE DEBUG:', {
          selectedDate: selectedDate,
          selectedDateString: selectedDate.toString(),
          selectedDateISO: selectedDate.toISOString(),
          formattedDateStr: dateStr,
          dayOfWeek: selectedDate.toLocaleDateString('en-US', { weekday: 'long' }),
          utcDay: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' })
        });
        const mode = await bookingService.getQueueMode(clinicId, dateStr);
        setQueueMode(mode);
      } catch (err) {
        console.error('Error fetching queue mode:', err);
        toast({
          title: "Error",
          description: "Failed to check queue mode for this date.",
          variant: "destructive",
        });
      } finally {
        setLoadingMode(false);
      }
    };

    fetchQueueMode();
  }, [clinicId, selectedDate]);

  // Reset time when date/type changes
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
      // Validation based on queue mode
      if (!selectedDate || !appointmentType) {
        toast({
          title: "Missing Information",
          description: "Please fill in all appointment details.",
          variant: "destructive",
        });
        return;
      }

      // Only require time if in time_grid_fixed mode
      if (queueMode === 'time_grid_fixed' && !selectedTime) {
        toast({
          title: "Missing Information",
          description: "Please select a time slot.",
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
        title: "✅ Booking Confirmed!",
        description: "Your appointment has been successfully booked.",
      });
      
    } catch (error: unknown) {
      logger.error("Booking failed", error instanceof Error ? error : new Error(String(error)), { 
        clinicId, 
        userId: user?.id, 
        date: format(selectedDate!, "yyyy-MM-dd"), 
        time: selectedTime 
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
    }
  };

  const getAvailableTimeSlots = () => {
    if (!availableSlots?.slots) return [];
    return availableSlots.slots
      .filter(slot => slot.available)
      .map(slot => slot.time.substring(0, 5)); // Convert HH:MM:SS to HH:MM
  };


  if (loadingClinic) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  const availableTimeSlots = getAvailableTimeSlots();

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            {clinicInfo?.clinic && (
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-2">
                  {clinicInfo.clinic.name}
                </h1>
                <p className="text-gray-600 text-lg">{clinicInfo.clinic.specialty}</p>
              </div>
            )}
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
                  step >= s 
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg" 
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`w-16 h-1 mx-2 rounded-full transition-all ${
                    step > s ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>

          <Card className="shadow-2xl border-0 backdrop-blur-sm bg-white/95 rounded-2xl">
            {/* STEP 1: Select Date & Time */}
            {step === 1 && (
              <div className="p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Select Date & Time</h2>
                  <p className="text-muted-foreground">Choose your preferred appointment slot</p>
                </div>

                <div className="space-y-6">
                  {/* Appointment Type */}
                  <div>
                    <Label className="text-base font-semibold mb-2 block">
                      Appointment Type
                    </Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clinicInfo?.appointmentTypes?.map((type) => (
                          <SelectItem key={type.name} value={type.name}>
                            {type.label} ({type.duration} min)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Selection */}
                  <div>
                    <Label className="text-base font-semibold mb-2 block">Select Date</Label>
                    <div className="flex flex-col md:flex-row items-start gap-6">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < startOfDay(new Date()) || isDayClosed(date)}
                        className="rounded-xl"
                      />

                      {/* Queue Mode Info Badge */}
                      {selectedDate && queueMode && !loadingMode && (
                        <div className={`flex-1 p-4 rounded-xl ${
                          queueMode === 'ordinal_queue' 
                            ? 'bg-purple-50 border-2 border-purple-200' 
                            : 'bg-blue-50 border-2 border-blue-200'
                        }`}>
                          <div className="flex items-start gap-3">
                            {queueMode === 'ordinal_queue' ? (
                              <ListOrdered className="h-6 w-6 text-purple-600 mt-0.5" />
                            ) : (
                              <Timer className="h-6 w-6 text-blue-600 mt-0.5" />
                            )}
                            <div>
                              <h3 className="font-semibold text-lg mb-1">
                                {queueMode === 'ordinal_queue' ? 'Free Queue Mode' : 'Scheduled Slots Mode'}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {queueMode === 'ordinal_queue' 
                                  ? 'First-come, first-served. Join the queue and get a queue number.'
                                  : 'Select a specific time slot for your appointment.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Time Selection OR Queue Join - CONDITIONAL */}
                  {queueMode === 'time_grid_fixed' && (
                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Select Time
                        {loadingSlots && (
                          <span className="ml-2 text-xs text-blue-600">
                            (Checking availability...)
                          </span>
                        )}
                      </Label>

                      {!appointmentType && (
                        <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-xl">
                          <Info className="h-4 w-4" />
                          <span>Please select an appointment type first</span>
                        </div>
                      )}

                      {appointmentType && availableTimeSlots.length === 0 && !loadingSlots && (
                        <div className="flex items-center gap-2 p-4 bg-orange-50 rounded-xl">
                          <AlertCircle className="h-4 w-4" />
                          <span>No available slots for this date.</span>
                        </div>
                      )}

                      {appointmentType && availableTimeSlots.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto p-2">
                          {availableTimeSlots.map((time) => (
                            <Button
                              key={time}
                              variant={selectedTime === time ? "default" : "outline"}
                              onClick={() => setSelectedTime(time)}
                              className="w-full"
                            >
                              {time}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Free Queue Mode - No Time Selection Needed */}
                  {queueMode === 'ordinal_queue' && appointmentType && (
                    <div className="p-6 bg-purple-50 border-2 border-purple-200 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Users className="h-6 w-6 text-purple-600 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-lg mb-1">Ready to Join Queue</h3>
                          <p className="text-sm text-gray-700">
                            No time slot needed. You'll receive a queue number when you confirm your booking.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  <div>
                    <Label className="text-base font-semibold mb-2 block">
                      Reason for Visit (Optional)
                    </Label>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly describe your reason for visit..."
                      rows={3}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleNextStep}
                  className="w-full"
                  size="lg"
                  disabled={
                    !selectedDate || 
                    !appointmentType || 
                    loadingMode ||
                    (queueMode === 'time_grid_fixed' && !selectedTime)
                  }
                >
                  {queueMode === 'ordinal_queue' ? 'Join Queue' : 'Continue'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* STEP 2: Confirm */}
            {step === 2 && (
              <div className="p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Confirm Your Booking</h2>
                  <p className="text-muted-foreground">Review your appointment details</p>
                </div>

                <div className="space-y-4 p-6 bg-blue-50 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <p className="font-semibold">Date</p>
                      <p className="text-gray-700">
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Show time only for time_grid_fixed mode */}
                  {queueMode === 'time_grid_fixed' && selectedTime && (
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-blue-600 mt-1" />
                      <div>
                        <p className="font-semibold">Time</p>
                        <p className="text-gray-700">{selectedTime}</p>
                      </div>
                    </div>
                  )}

                  {/* Show queue mode badge */}
                  {queueMode === 'ordinal_queue' && (
                    <div className="flex items-start gap-3">
                      <ListOrdered className="h-5 w-5 text-purple-600 mt-1" />
                      <div>
                        <p className="font-semibold">Queue Mode</p>
                        <p className="text-gray-700">First-come, first-served (no fixed time)</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <p className="font-semibold">Appointment Type</p>
                      <p className="text-gray-700 capitalize">
                        {clinicInfo?.appointmentTypes?.find(t => t.name === appointmentType)?.label}
                      </p>
                    </div>
                  </div>

                  {reason && (
                    <div className="pt-4 border-t">
                      <p className="font-semibold mb-1">Reason for Visit</p>
                      <p className="text-gray-700">{reason}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button 
                    onClick={handleSubmitBooking} 
                    className="flex-1"
                    disabled={isBooking}
                  >
                    {isBooking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Booking...
                      </>
                    ) : (
                      queueMode === 'ordinal_queue' ? 'Join Queue' : 'Confirm Booking'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Success */}
            {step === 3 && bookingResult && (
              <div className="text-center space-y-6 py-8 px-6">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-12 w-12 text-white" />
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold mb-2">
                    {queueMode === 'ordinal_queue' ? 'Joined Queue!' : 'Booking Confirmed!'}
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    {queueMode === 'ordinal_queue' 
                      ? 'You have successfully joined the queue.'
                      : 'Your appointment has been successfully booked.'}
                  </p>
                </div>

                {bookingResult.queuePosition && (
                  <div className="p-6 bg-blue-50 rounded-xl">
                    <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Your Queue Position</p>
                    <p className="text-3xl font-bold text-blue-600">
                      #{bookingResult.queuePosition}
                    </p>
                  </div>
                )}

                {queueMode === 'time_grid_fixed' && selectedTime && (
                  <div className="p-6 bg-blue-50 rounded-xl">
                    <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Scheduled Time</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {selectedTime}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {selectedDate && format(selectedDate, "MMMM d, yyyy")}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  <Button onClick={() => navigate("/")}>
                    Browse More Clinics
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/patient/dashboard")}>
                    View My Appointments
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(12deg); }
          50% { transform: translateY(-20px) rotate(12deg); }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>

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