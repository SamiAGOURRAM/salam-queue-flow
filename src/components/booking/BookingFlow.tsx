import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Info, Users, ArrowRight } from "lucide-react";
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
      const { data, error } = await supabase
        .from("clinics")
        .select("*")
        .eq("id", clinicId)
        .single();

      if (error) throw error;
      setClinic(data);
    } catch (error) {
      console.error("Error fetching clinic:", error);
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
      
      const { data, error } = await supabase
        .from("appointments")
        .select("start_time, status, id")
        .eq("clinic_id", clinicId)
        .eq("appointment_date", dateStr)
        .in("status", ACTIVE_STATUSES);

      if (error) {
        throw error;
      }
      
      // Extract time from start_time (timestamp) to UI format (HH:MM)
      const slots = (data || []).map(apt => {
        if (!apt.start_time) return null;
        
        // Extract time from timestamp: "2025-11-27T10:00:00+01:00" -> "10:00"
        const timeStr = format(new Date(apt.start_time), "HH:mm");
        return timeStr;
      }).filter(Boolean) as string[];
      
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
          console.log("Real-time appointment change:", payload);
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
      
      console.log("\n🔍 === CHECKING SLOT AVAILABILITY ===");
      console.log("   Clinic ID:", clinicId);
      console.log("   Date:", dateStr);
      console.log("   Time (UI format):", time);
      console.log("   Time (DB format):", timeWithSeconds);
      
      // Check if slot is booked by comparing start_time
      // Build the full datetime string for the selected time
      const fullDateTime = `${dateStr}T${timeWithSeconds}`;
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, status, patient_id")
        .eq("clinic_id", clinicId)
        .eq("appointment_date", dateStr)
        .gte("start_time", fullDateTime)
        .lt("start_time", `${dateStr}T${timeWithSeconds.split(':').slice(0, 2).join(':')}:${String(parseInt(timeWithSeconds.split(':')[2] || '0') + 1).padStart(2, '0')}`)
        .in("status", ACTIVE_STATUSES);

      if (error) {
        console.error("❌ Query error:", error);
        throw error;
      }
      
      const isAvailable = !data || data.length === 0;
      
      if (!isAvailable) {
        console.log("   ❌ SLOT TAKEN - Existing appointments:", data);
      } else {
        console.log("   ✅ SLOT AVAILABLE");
      }
      
      console.log("=================================\n");
      
      return isAvailable;
    } catch (error) {
      console.error("❌ Error checking slot availability:", error);
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

      console.log("📝 Starting booking process...");
      console.log("   Date:", format(selectedDate!, "yyyy-MM-dd"));
      console.log("   Time (UI):", selectedTime);
      
      // Convert time to database format (HH:MM:SS)
      const timeForDB = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;
      console.log("   Time (DB):", timeForDB);
      console.log("   Type:", appointmentType);

      // Get clinic staff (using RPC for now, could be refactored to StaffService later)
      const { data: staffData, error: staffError } = await supabase
        .rpc('get_clinic_staff_for_booking', { p_clinic_id: clinicId });

      if (staffError || !staffData || staffData.length === 0) {
        console.error("❌ Could not find clinic staff:", staffError);
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
        console.warn("⚠️ Slot was taken between selection and booking");
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

      console.log("✅ Slot is available, creating appointment...");

      // Convert date and time to ISO format for QueueService
      const appointmentDate = format(selectedDate!, "yyyy-MM-dd");
      const [hours, minutes] = selectedTime.split(':');
      const startDateTime = new Date(selectedDate!);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Get appointment duration from clinic settings or default to 15 minutes
      const duration = clinic?.settings?.average_appointment_duration || 15;
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + duration);

      console.log("   Creating appointment via QueueService...");
      console.log("   Start:", startDateTime.toISOString());
      console.log("   End:", endDateTime.toISOString());

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

      console.log("🎉 Booking successful! Appointment:", newAppointment);

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
      console.error("❌ Booking failed:", error);
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-12 px-4 relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="max-w-3xl mx-auto relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md border border-blue-100 mb-6">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <CalendarIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Book Your Appointment</span>
            </div>
            
            {clinic && (
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-2">
                  {clinic.name}
                </h1>
                <p className="text-gray-600 text-lg">{clinic.specialty}</p>
              </div>
            )}
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
                  step >= s 
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg scale-110" 
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

          {/* Main Card */}
          <Card className="shadow-2xl border-0 backdrop-blur-sm bg-white/95 rounded-2xl overflow-hidden">
            
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
                    <Label htmlFor="appointmentType" className="text-base font-semibold mb-2 block">
                      Appointment Type
                    </Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger className="h-12 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500">
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
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Date Picker */}
                    <div>
                      <Label className="text-base font-semibold mb-2 block">Select Date</Label>
                      <div className="border-2 border-gray-100 rounded-xl p-4 bg-gray-50">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => date < startOfDay(new Date()) || isDayClosed(date)}
                          className="rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Select Time
                        {isLoadingSlots && (
                          <span className="ml-2 text-xs text-blue-600 font-normal animate-pulse">
                            (Checking availability...)
                          </span>
                        )}
                      </Label>
                      
                      {!appointmentType && (
                        <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                          <Info className="h-4 w-4 flex-shrink-0" />
                          <span>Please select an appointment type first</span>
                        </div>
                      )}
                      
                      {appointmentType && availableTimeSlots.length === 0 && !isLoadingSlots && (
                        <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-xl text-orange-700 text-sm">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>No available slots for this date. Please try another day.</span>
                        </div>
                      )}
                      
                      {appointmentType && availableTimeSlots.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                              {availableTimeSlots.length} slot{availableTimeSlots.length !== 1 ? 's' : ''} available
                            </span>
                            {bookedSlots.length > 0 && (
                              <span className="text-xs text-gray-500">
                                ({bookedSlots.length} already booked)
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-2">
                            {availableTimeSlots.map((time) => (
                              <Button
                                key={time}
                                variant={selectedTime === time ? "default" : "outline"}
                                onClick={() => setSelectedTime(time)}
                                className={`w-full h-11 transition-all ${
                                  selectedTime === time
                                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg"
                                    : "bg-white hover:bg-gray-50 border-gray-200"
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
                    <Label htmlFor="reason" className="text-base font-semibold mb-2 block">
                      Reason for Visit (Optional)
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly describe your reason for visit..."
                      rows={3}
                      className="resize-none bg-gray-50 border-0 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleNextStep}
                  className="w-full gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                  disabled={!selectedDate || !selectedTime || !appointmentType}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* STEP 2: Confirm Booking */}
            {step === 2 && (
              <div className="p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Confirm Your Booking</h2>
                  <p className="text-muted-foreground">Review your appointment details</p>
                </div>

                <div className="space-y-4 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg">
                      <CalendarIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-blue-900">Date & Time</p>
                      <p className="text-gray-700">
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")} at {selectedTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-blue-900">Appointment Type</p>
                      <p className="text-gray-700 capitalize">
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                        {" "}
                        ({appointmentTypes.find(t => t.name === appointmentType)?.duration} min)
                      </p>
                    </div>
                  </div>

                  {reason && (
                    <div className="pt-4 border-t border-blue-200">
                      <p className="font-semibold mb-1 text-blue-900">Reason for Visit</p>
                      <p className="text-gray-700">{reason}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmitBooking}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all"
                    size="lg"
                  >
                    Confirm Booking
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Success */}
            {step === 3 && (
              <div className="text-center space-y-6 py-8 px-6">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xl">
                  <CheckCircle2 className="h-12 w-12 text-white" />
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold mb-2">Booking Confirmed!</h2>
                  <p className="text-muted-foreground text-lg">
                    Your appointment has been successfully booked.
                  </p>
                </div>

                {/* Queue Position */}
                {queuePosition !== null && (
                  <div className="max-w-md mx-auto p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-blue-700 font-medium">Your Queue Position</p>
                        <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                          #{queuePosition}
                        </p>
                      </div>
                    </div>
                    {totalInQueue && (
                      <p className="text-sm text-blue-600">
                        {totalInQueue === 1 
                          ? "You're the only one in the queue today!" 
                          : `${totalInQueue} patient${totalInQueue > 1 ? 's' : ''} in queue today`}
                      </p>
                    )}
                  </div>
                )}

                {/* Summary */}
                <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl text-left max-w-md mx-auto">
                  <h3 className="font-semibold mb-3 text-blue-900">Appointment Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clinic:</span>
                      <span className="font-medium text-gray-900">{clinic?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="font-medium text-gray-900">
                        {selectedDate && format(selectedDate, "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium text-gray-900">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                      </span>
                    </div>
                    {queuePosition !== null && (
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <span className="text-muted-foreground">Queue Position:</span>
                        <span className="font-bold text-blue-600">#{queuePosition}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => navigate("/")}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
                  >
                    Browse More Clinics
                  </Button>
                  {user && (
                    <Button variant="outline" onClick={() => navigate("/patient/dashboard")}>
                      View My Appointments
                    </Button>
                  )}
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