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
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format, addDays, startOfDay, isBefore } from "date-fns";
import AuthModal from "@/components/auth/AuthModal";

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
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pt-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button variant="ghost" onClick={() => navigate(`/clinic/${clinicId}`)} className="mb-6 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Clinic
          </Button>

          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      step >= s ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s}
                  </div>
                  {s < 3 && (
                    <div
                      className={`flex-1 h-1 mx-2 transition-colors ${
                        step > s ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Appointment Details</span>
              <span>Confirmation</span>
              <span>Complete</span>
            </div>
          </div>

          <Card className="p-8 border-0 shadow-lg">
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Select Appointment Details</h2>
                  <p className="text-muted-foreground">Choose your preferred date, time, and appointment type</p>
                </div>

                <div className="space-y-6">
                  {/* Appointment Type */}
                  <div>
                    <Label className="text-base font-semibold mb-2">Appointment Type</Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {appointmentTypes.map((type) => (
                          <SelectItem key={type.name} value={type.name}>
                            <div className="flex items-center justify-between w-full">
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

                  {/* Date Selection */}
                  <div>
                    <Label className="text-base font-semibold mb-2">Select Date</Label>
                    <div className="calendar-container">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setSelectedTime(""); // Reset time when date changes
                        }}
                        disabled={(date) => {
                          // Disable past dates
                          if (isBefore(date, startOfDay(new Date()))) return true;
                          // Disable closed days
                          return isDayClosed(date);
                        }}
                        className="rounded-md border shadow-sm"
                        modifiersClassNames={{
                          selected: "bg-primary text-primary-foreground",
                          today: "font-bold text-primary"
                        }}
                      />
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div>
                    <Label className="text-base font-semibold mb-2">Select Time</Label>
                    {!appointmentType && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg mb-3">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <p className="text-sm text-amber-600">
                          Please select an appointment type first
                        </p>
                      </div>
                    )}
                    {appointmentType && timeSlots.length === 0 && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg mb-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <p className="text-sm text-red-600">
                          This clinic is closed on the selected day. Please choose another date.
                        </p>
                      </div>
                    )}
                    {appointmentType && timeSlots.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {timeSlots.map((time) => (
                          <Button
                            key={time}
                            variant={selectedTime === time ? "default" : "outline"}
                            onClick={() => setSelectedTime(time)}
                            className={`w-full ${
                              selectedTime === time
                                ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                                : ""
                            }`}
                          >
                            {time}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <Label htmlFor="reason" className="text-base font-semibold mb-2">
                      Reason for Visit (Optional)
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly describe your reason for visit..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleNextStep}
                  className="w-full gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
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
                  <h2 className="text-2xl font-bold mb-2">Confirm Your Booking</h2>
                  <p className="text-muted-foreground">Review your appointment details</p>
                </div>

                <div className="space-y-4 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-lg border border-blue-100 dark:border-blue-900">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <CalendarIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">Date & Time</p>
                      <p className="text-muted-foreground">
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")} at {selectedTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">Appointment Type</p>
                      <p className="text-muted-foreground capitalize">
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                        {" "}
                        ({appointmentTypes.find(t => t.name === appointmentType)?.duration} min)
                      </p>
                    </div>
                  </div>

                  {reason && (
                    <div className="pt-3 border-t border-blue-200 dark:border-blue-800">
                      <p className="font-semibold mb-1">Reason for Visit</p>
                      <p className="text-muted-foreground">{reason}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmitBooking}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    size="lg"
                  >
                    Confirm Booking
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="text-center space-y-6 py-8">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-2">Booking Confirmed!</h2>
                  <p className="text-muted-foreground text-lg">
                    Your appointment has been successfully booked. You'll receive a confirmation shortly.
                  </p>
                </div>

                <div className="p-6 bg-muted/50 rounded-lg text-left max-w-md mx-auto">
                  <h3 className="font-semibold mb-3">Appointment Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clinic:</span>
                      <span className="font-medium">{clinic.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="font-medium">
                        {selectedDate && format(selectedDate, "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium capitalize">
                        {appointmentTypes.find(t => t.name === appointmentType)?.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => navigate("/")}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
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