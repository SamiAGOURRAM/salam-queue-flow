import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { format, addDays, startOfDay, isBefore } from "date-fns";
import AuthModal from "@/components/auth/AuthModal";

// (Keep your ClinicSettings and Clinic interfaces here)
interface ClinicSettings {
  buffer_time?: number;
  working_hours?: {
    [key: string]: {
      open?: string;
      close?: string;
      closed?: boolean;
    };
  };
  allow_walk_ins?: boolean;
  max_queue_size?: number;
  payment_methods?: {
    cash?: boolean;
    card?: boolean;
    online?: boolean;
    insurance?: boolean;
  };
  appointment_types?: Array<{
    name: string;
    label: string;
    duration: number;
  }>;
  requires_appointment?: boolean;
  average_appointment_duration?: number;
}

interface Clinic {
  id: string;
  name: string;
  specialty: string;
  settings: any;
}


const BookingFlow = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Booking data
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (clinicId) {
      fetchClinic();
    }
  }, [clinicId]);

  const fetchClinic = async () => {
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
  };

  // Check if a day is closed
  const isDayClosed = (date: Date): boolean => {
    if (!clinic?.settings?.working_hours) return false;
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[date.getDay()];
    const daySchedule = clinic.settings.working_hours[dayName];
    
    return daySchedule?.closed === true;
  };

  // Generate time slots based on clinic working hours and selected date
  const generateTimeSlots = (): string[] => {
    if (!clinic?.settings?.working_hours || !selectedDate) return [];

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const daySchedule = clinic.settings.working_hours[dayName];

    if (!daySchedule || daySchedule.closed) return [];

    const openTime = daySchedule.open || "09:00";
    const closeTime = daySchedule.close || "18:00";
    
    // Get duration from selected appointment type or use average
    const selectedTypeData = clinic.settings.appointment_types?.find(
      t => t.name === appointmentType
    );
    const duration = selectedTypeData?.duration || clinic.settings.average_appointment_duration || 15;
    const bufferTime = clinic.settings.buffer_time || 0;
    const slotInterval = duration + bufferTime;

    const slots: string[] = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    let currentHour = openHour;
    let currentMinute = openMinute;

    while (
      currentHour < closeHour ||
      (currentHour === closeHour && currentMinute < closeMinute)
    ) {
      const timeString = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
      slots.push(timeString);

      // Add interval
      currentMinute += slotInterval;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    return slots;
  };

  // Get appointment types from clinic settings
  const getAppointmentTypes = () => {
    if (!clinic?.settings?.appointment_types || clinic.settings.appointment_types.length === 0) {
      // Fallback to default types if none configured
      return [
        { name: "consultation", label: "Consultation", duration: 15 },
        { name: "follow_up", label: "Follow-up", duration: 10 },
        { name: "checkup", label: "Checkup", duration: 15 },
        { name: "procedure", label: "Procedure", duration: 30 },
      ];
    }
    return clinic.settings.appointment_types;
  };

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
  
      console.log("=== BOOKING DEBUG START ===");
      console.log("Clinic ID:", clinicId);
      console.log("Patient ID:", userId);
  
      // Use RPC function to get staff (bypasses RLS)
      const { data: staffData, error: staffError } = await supabase
        .rpc('get_clinic_staff_for_booking', { p_clinic_id: clinicId });
  
      console.log("Staff Data (RPC):", staffData);
      console.log("Staff Error:", staffError);
  
      if (staffError || !staffData || staffData.length === 0) {
        console.error("Staff lookup failed:", staffError);
        toast({
          title: "Configuration Error",
          description: "Could not find clinic staff. Please contact the clinic.",
          variant: "destructive",
        });
        return;
      }
  
      const staffId = staffData[0].staff_id;
  
      const bookingData = {
        clinic_id: clinicId,
        patient_id: userId,
        staff_id: staffId,
        appointment_date: format(selectedDate!, "yyyy-MM-dd"),
        scheduled_time: selectedTime,
        appointment_type: appointmentType,
        reason_for_visit: reason || null,
        status: "scheduled",
        booking_method: "patient_app",
      };
  
      console.log("Booking Data:", JSON.stringify(bookingData, null, 2));
  
      const { data, error } = await supabase
        .from("appointments")
        .insert([bookingData])
        .select()
        .single();
  
      console.log("Insert Result:", data);
      console.log("Insert Error:", error);
  
      if (error) throw error;
  
      setStep(3);
      toast({
        title: "Booking Confirmed!",
        description: "Your appointment has been successfully booked.",
      });
    } catch (error: any) {
      console.error("=== BOOKING FAILED ===");
      console.error("Full Error:", error);
      
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Reset time selection when date changes
  useEffect(() => {
    setSelectedTime("");
  }, [selectedDate]);

  const appointmentTypes = getAppointmentTypes();
  const timeSlots = generateTimeSlots();

  if (!clinic) {
    return (
      <div className="min-h-screen w-full bg-transparent relative overflow-x-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
        </div>
        <div className="container mx-auto px-4 py-8">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen w-full bg-transparent relative overflow-x-hidden pt-16">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
          <Button 
            variant="ghost" 
            onClick={() => navigate(`/clinic/${clinicId}`)} 
            className="mb-6 gap-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Clinic
          </Button>

          {/* ============================================================
          ===             START: REBUILT PROGRESS INDICATOR          ===
          ============================================================
          */}
          <div className="mb-8">
            <div className="flex items-start">

              {/* --- Step 1 --- */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                    step >= 1 
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg" 
                    : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step > 1 ? <CheckCircle2 className="w-5 h-5" /> : 1}
                </div>
                <span className={`mt-2 text-sm text-center ${step === 1 ? "font-semibold text-blue-600" : "text-muted-foreground"}`}>
                  Appointment Details
                </span>
              </div>

              {/* --- Line 1 --- */}
              <div
                className={`flex-1 h-1 mx-2 mt-5 transition-all duration-300 ${
                  step > 1 ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-gray-200"
                }`}
              />

              {/* --- Step 2 --- */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                    step >= 2
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg" 
                    : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step > 2 ? <CheckCircle2 className="w-5 h-5" /> : 2}
                </div>
                <span className={`mt-2 text-sm text-center ${step === 2 ? "font-semibold text-blue-600" : "text-muted-foreground"}`}>
                  Confirmation
                </span>
              </div>

              {/* --- Line 2 --- */}
              <div
                className={`flex-1 h-1 mx-2 mt-5 transition-all duration-300 ${
                  step > 2 ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-gray-200"
                }`}
              />

              {/* --- Step 3 --- */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                    step >= 3
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg" 
                    : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step >= 3 ? <CheckCircle2 className="w-5 h-5" /> : 3}
                </div>
                <span className={`mt-2 text-sm text-center ${step === 3 ? "font-semibold text-blue-600" : "text-muted-foreground"}`}>
                  Complete
                </span>
              </div>
              
            </div>
          </div>
          {/* ============================================================
          ===              END: REBUILT PROGRESS INDICATOR           ===
          ============================================================
          */}

          <Card className="p-6 sm:p-8 border-0 shadow-xl rounded-2xl bg-white/95 backdrop-blur-lg">
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Select Appointment Details</h2>
                  <p className="text-muted-foreground">Choose your preferred date, time, and appointment type</p>
                </div>

                <div className="space-y-6">
                  {/* Appointment Type */}
                  <div>
                    <Label className="text-base font-semibold mb-2 block">Appointment Type</Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger className="h-12 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white/95 backdrop-blur-xl border-blue-100 rounded-xl">
                        {appointmentTypes.map((type) => (
                          <SelectItem key={type.name} value={type.name}>
                            <div className="flex items-center justify-between w-full py-1">
                              <span>{type.label}</span>
                              <span className="text-xs text-muted-foreground ml-4">
                                ({type.duration} min)
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date & Time Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    
                    {/* Date Selection (Column 1) */}
                    <div>
                      <Label className="text-base font-semibold mb-2 block">Select Date</Label>
                      <div className="flex justify-center md:justify-start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => {
                            setSelectedDate(date);
                            setSelectedTime(""); // Reset time when date changes
                          }}
                          disabled={(date) => {
                            if (isBefore(date, startOfDay(new Date()))) return true;
                            return isDayClosed(date);
                          }}
                          className="rounded-xl border border-gray-100 shadow-sm"
                          modifiersClassNames={{
                            selected: "bg-gradient-to-r from-blue-600 to-cyan-600 text-primary-foreground hover:bg-blue-600",
                            today: "font-bold text-blue-600"
                          }}
                        />
                      </div>
                    </div>

                    {/* Time Selection (Column 2) */}
                    <div className="flex flex-col">
                      <Label className="text-base font-semibold mb-2 block">Select Time</Label>
                      {!appointmentType && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-3">
                          <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          <p className="text-sm text-blue-700 font-medium">
                            Please select an appointment type to see available times.
                          </p>
                        </div>
                      )}
                      {appointmentType && timeSlots.length === 0 && selectedDate && (
                        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-lg mb-3">
                          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <p className="text-sm text-red-700 font-medium">
                            This clinic is closed on the selected day. Please choose another date.
                          </p>
                        </div>
                      )}
                      {appointmentType && timeSlots.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {timeSlots.map((time) => (
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
                      )}
                    </div>
                  </div>
                  {/* End Date & Time Grid */}

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

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Confirm Your Booking</h2>
                  <p className="text-muted-foreground">Review your appointment details</p>
                </div>

                <div className="space-y-4 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-xl border border-blue-100 dark:border-blue-900">
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
                    <div className="pt-4 border-t border-blue-200 dark:border-blue-800">
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

            {step === 3 && (
              <div className="text-center space-y-6 py-8">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xl">
                  <CheckCircle2 className="h-12 w-12 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-2">Booking Confirmed!</h2>
                  <p className="text-muted-foreground text-lg">
                    Your appointment has been successfully booked. You'll receive a confirmation shortly.
                  </p>
                </div>

                <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl text-left max-w-md mx-auto">
                  <h3 className="font-semibold mb-3 text-blue-900">Appointment Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clinic:</span>
                      <span className="font-medium text-gray-900">{clinic.name}</span>
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
                  </div>
                </div>

                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => navigate("/")}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl"
                  >
                    Browse More Clinics
                  </Button>
                  {user && (
                    <Button variant="outline" onClick={() => navigate("/my-appointments")}>
                      View My Appointments
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Animated Background Styles */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(12deg); }
          50% { transform: translateY(-20px) rotate(12deg); }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
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