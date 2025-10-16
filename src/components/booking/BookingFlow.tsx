import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, CheckCircle2 } from "lucide-react";
import { format, addDays, startOfDay, isBefore } from "date-fns";
import AuthModal from "@/components/auth/AuthModal";

const BookingFlow = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [clinic, setClinic] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Booking data
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [reason, setReason] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

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
      if (!userId && !guestName && !guestPhone) {
        toast({
          title: "Authentication Required",
          description: "Please sign in or provide your contact details.",
          variant: "destructive",
        });
        return;
      }

      // Get first available staff member
      const { data: staffData } = await supabase
        .from("clinic_staff")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .limit(1)
        .single();

      const bookingData = {
        clinic_id: clinicId,
        patient_id: userId,
        staff_id: staffData?.id || clinicId, // Fallback to clinic_id if no staff
        appointment_date: format(selectedDate!, "yyyy-MM-dd"),
        scheduled_time: selectedTime,
        appointment_type: appointmentType as any,
        reason_for_visit: reason,
        status: "scheduled" as any,
        booking_method: "patient_app",
      };

      const { data, error } = await supabase
        .from("appointments")
        .insert([bookingData])
        .select()
        .single();

      if (error) throw error;

      setStep(3);
      toast({
        title: "Booking Confirmed!",
        description: "Your appointment has been successfully booked.",
      });
    } catch (error) {
      console.error("Error booking appointment:", error);
      toast({
        title: "Booking Failed",
        description: "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const timeSlots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30"
  ];

  const appointmentTypes = [
    { value: "consultation", label: "Consultation" },
    { value: "follow_up", label: "Follow-up" },
    { value: "checkup", label: "Checkup" },
    { value: "procedure", label: "Procedure" },
  ];

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
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s}
                  </div>
                  {s < 3 && <div className={`flex-1 h-1 mx-2 ${step > s ? "bg-primary" : "bg-muted"}`} />}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Appointment Details</span>
              <span>Confirmation</span>
              <span>Complete</span>
            </div>
          </div>

          <Card className="p-8">
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Select Appointment Details</h2>

                <div className="space-y-4">
                  <div>
                    <Label>Appointment Type</Label>
                    <Select value={appointmentType} onValueChange={setAppointmentType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {appointmentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Select Date</Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => isBefore(date, startOfDay(new Date()))}
                      className="rounded-md border"
                    />
                  </div>

                  <div>
                    <Label>Select Time</Label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {timeSlots.map((time) => (
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
                  </div>

                  <div>
                    <Label htmlFor="reason">Reason for Visit (Optional)</Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly describe your reason for visit..."
                      rows={3}
                    />
                  </div>
                </div>

                <Button onClick={handleNextStep} className="w-full gap-2" size="lg">
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Confirm Your Booking</h2>

                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Date & Time</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")} at {selectedTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Appointment Type</p>
                      <p className="text-sm text-muted-foreground capitalize">{appointmentType}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button onClick={handleSubmitBooking} className="flex-1">
                    Confirm Booking
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="text-center space-y-6 py-8">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
                <p className="text-muted-foreground">
                  Your appointment has been successfully booked. You'll receive a confirmation shortly.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => navigate("/")}>Browse More Clinics</Button>
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
