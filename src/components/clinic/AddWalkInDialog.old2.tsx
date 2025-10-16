import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { QueueService } from "@/services/queue/QueueService";
import { AppointmentType } from "@/services/queue/models/QueueModels";
import { logger } from "@/services/shared/logging/Logger";

interface AddWalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSuccess: () => void;
}

const queueService = new QueueService();

export function AddWalkInDialog({ open, onOpenChange, clinicId, onSuccess }: AddWalkInDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(AppointmentType.CONSULTATION);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!name || !phone) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    // Clean and validate phone number
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 8) {
      toast({
        title: "Invalid Phone",
        description: "Please enter a valid phone number",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      logger.info('Adding walk-in patient', { name, phone, clinicId });

      // Check if patient exists by phone number
      let patientId;
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (existingProfile) {
        patientId = existingProfile.id;
        logger.debug('Using existing patient', { patientId, name: existingProfile.full_name });
        
        toast({
          title: "Patient Found",
          description: `Adding ${existingProfile.full_name} to queue`,
        });
      } else {
        // For walk-ins without account, we need to create a minimal auth account
        // They can claim this later by signing up with the same phone number
        const walkInEmail = `walkin_${cleanPhone.replace(/[^0-9]/g, '')}@temp.queuemed.local`;
        const walkInPassword = `WalkIn_${Math.random().toString(36).slice(-12)}${Date.now()}`;
        
        logger.debug('Creating walk-in patient account', { phone: cleanPhone, email: walkInEmail });
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: walkInEmail,
          password: walkInPassword,
          options: {
            data: {
              full_name: name.trim(),
              phone_number: cleanPhone,
              role: 'patient',
              is_walk_in: true
            },
            emailRedirectTo: undefined // Don't send confirmation email
          }
        });

        if (authError) {
          logger.error('Failed to create walk-in account', authError);
          throw new Error(`Failed to create patient: ${authError.message}`);
        }
        
        if (!authData.user) {
          throw new Error("No user data returned from signup");
        }
        
        patientId = authData.user.id;
        logger.info('Walk-in patient account created', { patientId, phone: cleanPhone });
        
        toast({
          title: "New Patient",
          description: `Creating appointment for ${name}`,
        });

        // Wait a bit for the trigger to create the profile
        await new Promise(resolve => setTimeout(resolve, 1000));
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

      // Use QueueService to add to queue
      const entry = await queueService.addToQueue({
        clinicId,
        patientId,
        staffId: staffData.user_id,
        appointmentDate: new Date(),
        appointmentType,
      });

      // Check in immediately (walk-in patients are already present)
      await queueService.checkInPatient(entry.id);

      toast({
        title: "Success",
        description: `${name} added to queue at position ${entry.queuePosition}`,
      });

      logger.info('Walk-in patient added successfully', { 
        appointmentId: entry.id, 
        position: entry.queuePosition 
      });

      setName("");
      setPhone("");
      setAppointmentType(AppointmentType.CONSULTATION);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      logger.error("Error adding walk-in", error as Error, { name, phone });
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
          <Select 
            value={appointmentType} 
            onValueChange={(value) => setAppointmentType(value as AppointmentType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AppointmentType.CONSULTATION}>Consultation</SelectItem>
              <SelectItem value={AppointmentType.FOLLOW_UP}>Follow Up</SelectItem>
              <SelectItem value={AppointmentType.EMERGENCY}>Emergency</SelectItem>
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
    </Dialog>
  );
}
