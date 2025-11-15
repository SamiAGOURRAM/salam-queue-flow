import { useState, useEffect } from "react";
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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const APPOINTMENT_TYPES = ["consultation", "follow_up", "procedure", "emergency"] as const;
type AppointmentTypeOption = typeof APPOINTMENT_TYPES[number];

interface BookAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSuccess: () => void;
  preselectedDate?: Date;
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  clinicId,
  onSuccess,
  preselectedDate,
}: BookAppointmentDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState<Date | undefined>(preselectedDate);
  const [time, setTime] = useState("");
  const [appointmentType, setAppointmentType] = useState<AppointmentTypeOption>("consultation");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Update date when preselectedDate changes
  useEffect(() => {
    if (preselectedDate) {
      setDate(preselectedDate);
    }
  }, [preselectedDate]);

  const handleSubmit = async () => {
    if (!fullName || !phone || !date || !time) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if patient exists or create new profile
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phone)
        .maybeSingle();

      let patientId: string;

      if (!existingProfile) {
        // Create new user via auth (email-based with phone in metadata)
        const tempEmail = `${phone.replace(/\+/g, '')}@scheduled.temp`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: tempEmail,
          password: Math.random().toString(36).slice(-12), // Random password
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
      } else {
        patientId = existingProfile.id;
      }

      // Get staff/doctor ID
      const { data: staffData } = await supabase
        .from("clinic_staff")
        .select("user_id")
        .eq("clinic_id", clinicId)
        .limit(1)
        .single();

      // Create appointment
      const { error: appointmentError } = await supabase
        .from("appointments")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          staff_id: staffData?.user_id || clinicId,
          appointment_date: format(date, "yyyy-MM-dd"),
          scheduled_time: time,
          appointment_type: appointmentType,
          reason_for_visit: reason,
          status: "scheduled",
          booking_method: "receptionist",
          is_walk_in: false,
        });

      if (appointmentError) throw appointmentError;

      toast({
        title: "Success",
        description: `Appointment booked for ${fullName}`,
      });

      // Reset form
      setFullName("");
      setPhone("");
      setDate(undefined);
      setTime("");
      setAppointmentType("consultation");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book Appointment for Patient</DialogTitle>
          <DialogDescription>
            Schedule an appointment for a patient by entering their details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Patient Full Name *</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ahmed Hassan"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 XXX XXX XXX"
            />
            <p className="text-xs text-muted-foreground">
              Patient will receive SMS updates
            </p>
          </div>

          <div className="space-y-2">
            <Label>Appointment Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
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

          <div className="space-y-2">
            <Label htmlFor="time">Time *</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Appointment Type</Label>
            <Select value={appointmentType} onValueChange={(value) => setAppointmentType(value as AppointmentTypeOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Visit</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Booking..." : "Book Appointment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
