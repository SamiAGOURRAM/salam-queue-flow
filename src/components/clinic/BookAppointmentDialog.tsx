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
import { patientService } from "@/services/patient";
import { staffService } from "@/services/staff";
import { useQueueService } from "@/hooks/useQueueService";

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
  
  // Get staffId from clinic - we'll use the first staff member
  const [staffId, setStaffId] = useState<string | null>(null);
  
  // Initialize queue service
  const { createAppointment } = useQueueService({ staffId: staffId || undefined });

  // Update date when preselectedDate changes
  useEffect(() => {
    if (preselectedDate) {
      setDate(preselectedDate);
    }
  }, [preselectedDate]);

  // Fetch staff ID when clinicId is available
  useEffect(() => {
    const fetchStaff = async () => {
      if (!clinicId) return;
      try {
        const staffList = await staffService.getStaffByClinic(clinicId);
        if (staffList.length > 0) {
          // Get the staff ID (not user_id) - we need the clinic_staff.id
          // But createAppointment needs staffId which is clinic_staff.id
          // Let's get the first staff member's ID
          setStaffId(staffList[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch staff', error);
      }
    };
    fetchStaff();
  }, [clinicId]);

  const handleSubmit = async () => {
    if (!fullName || !phone || !date || !time) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!staffId) {
      toast({
        title: "Error",
        description: "No staff member found for this clinic",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if patient exists using PatientService
      // Note: For booked appointments, we prefer registered users over guests
      let patientId: string;
      
      const patientResult = await patientService.findOrCreatePatient(phone, fullName);
      
      if (patientResult.patientId) {
        // Found registered patient - use it
        patientId = patientResult.patientId;
      } else {
        // No registered patient found - create new auth user for booked appointment
        // Note: This creates a full auth account (not a guest) for scheduled appointments
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
      }

      // Create appointment using QueueService
      const appointmentDate = format(date, "yyyy-MM-dd");
      const [hours, minutes] = time.split(':');
      const startDateTime = new Date(date);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + 15); // Default 15 min

      await createAppointment({
        clinicId,
        staffId,
        patientId,
        guestPatientId: null,
        isGuest: false,
        appointmentType: appointmentType,
        isWalkIn: false,
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
