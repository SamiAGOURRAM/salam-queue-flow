import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddWalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSuccess: () => void;
}

export function AddWalkInDialog({ open, onOpenChange, clinicId, onSuccess }: AddWalkInDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [appointmentType, setAppointmentType] = useState("consultation");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Check if patient exists
      let patientId;
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phone)
        .single();

      if (existingProfile) {
        patientId = existingProfile.id;
      } else {
        // Create temporary user account for walk-in
        const tempEmail = `${phone.replace(/\+/g, '')}@walkin.temp`;
        const tempPassword = Math.random().toString(36).slice(-16);
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: tempEmail,
          password: tempPassword,
          phone: phone,
          options: {
            data: {
              full_name: name,
              phone_number: phone
            }
          }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Failed to create user");
        
        patientId = authData.user.id;
      }

      // Get available staff
      const { data: staffData } = await supabase
        .from("clinic_staff")
        .select("user_id")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!staffData) {
        throw new Error("No available staff");
      }

      // Get current max queue position
      const today = new Date().toISOString().split('T')[0];
      const { data: lastPosition } = await supabase
        .from("appointments")
        .select("queue_position")
        .eq("clinic_id", clinicId)
        .eq("appointment_date", today)
        .order("queue_position", { ascending: false })
        .limit(1)
        .single();

      const newPosition = (lastPosition?.queue_position || 0) + 1;

      // Create appointment
      const { error: appointmentError } = await supabase
        .from("appointments")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          staff_id: staffData.user_id,
          appointment_date: today,
          appointment_type: appointmentType as "consultation" | "follow_up" | "emergency",
          is_walk_in: true,
          status: "waiting",
          queue_position: newPosition,
          checked_in_at: new Date().toISOString(),
          booking_method: "receptionist"
        });

      if (appointmentError) throw appointmentError;

      toast({
        title: "Success",
        description: `${name} added to queue at position ${newPosition}`,
      });

      setName("");
      setPhone("");
      setAppointmentType("consultation");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error adding walk-in:", error);
      toast({
        title: "Error",
        description: "Failed to add walk-in patient",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Walk-in Patient</DialogTitle>
          <DialogDescription>
            Register a patient without prior booking
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Patient Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212..."
              required
            />
          </div>
          <div>
            <Label htmlFor="type">Appointment Type</Label>
            <Select value={appointmentType} onValueChange={setAppointmentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">Consultation</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add to Queue"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
