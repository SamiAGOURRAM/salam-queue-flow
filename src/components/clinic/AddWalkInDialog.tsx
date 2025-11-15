/**
 * AddWalkInDialog (Final, Definitive Version)
 * This version restores the crucial check for an existing guest patient,
 * fixing the "duplicate key" database error.
 */
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logger } from "@/services/shared/logging/Logger";
import { useQueueService } from "@/hooks/useQueueService";

interface AddWalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId?: string;
  staffId?: string;
  onSuccess: () => void;
}

interface AppointmentType {
  name: string;
  label: string;
  duration: number;
}

interface ClinicSettingsShape {
  appointment_types?: AppointmentType[];
}

export function AddWalkInDialog({ open, onOpenChange, clinicId, staffId, onSuccess }: AddWalkInDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  
  const { createAppointment, checkInPatient } = useQueueService({ staffId });

  const fetchClinicSettings = useCallback(async () => {
    if (!clinicId) return;
    try {
      const { data } = await supabase.from("clinics").select("settings").eq("id", clinicId).single();
      const settings = (data?.settings as ClinicSettingsShape) || {};
      const types = settings.appointment_types || [];
      setAppointmentTypes(types);
      if (types.length > 0) {
        setAppointmentType((current) => current || types[0].name);
      }
    } catch (error) {
      logger.error("Error fetching clinic settings", error);
    }
  }, [clinicId]);

  useEffect(() => {
    if (open && clinicId) {
      fetchClinicSettings();
    }
  }, [open, clinicId, fetchClinicSettings]);

  // This is the fully corrected handleSubmit function
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !clinicId || !staffId) {
      toast({ title: "Error", description: "Missing required information (Name, Phone, Clinic, or Staff).", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      let patientId: string | null = null;
      let guestPatientId: string | null = null;
      
      // Step 1: Check for a registered user (profile)
      const { data: registeredPatient } = await supabase.from("profiles").select("id").eq("phone_number", phone).maybeSingle();

      if (registeredPatient) {
        patientId = registeredPatient.id;
        logger.info('Found registered patient', { patientId });
      } else {
        // Step 2: If not a registered user, check for an EXISTING guest patient
        const { data: existingGuest } = await supabase.from("guest_patients").select("id").eq("phone_number", phone).is("claimed_by", null).maybeSingle();

        if (existingGuest) {
          // Use the existing guest record
          guestPatientId = existingGuest.id;
          logger.info('Found existing guest patient', { guestPatientId });
        } else {
          // Only if no registered user AND no existing guest is found, create a NEW guest
          const { data: newGuest, error: guestError } = await supabase.from("guest_patients").insert({ full_name: name, phone_number: phone }).select('id').single();
          if (guestError) throw new Error(`Failed to create guest: ${guestError.message}`);
          guestPatientId = newGuest.id;
          logger.info('Created new guest patient', { guestPatientId });
        }
      }
      
      // Step 3: Prepare the DTO for the `createAppointment` service
      const selectedType = appointmentTypes.find(t => t.name === appointmentType);
      const duration = selectedType?.duration || 15;
      const now = new Date();
      const endTime = new Date(now.getTime() + duration * 60000);

      // Step 4: Call the `createAppointment` service
      const newAppointment = await createAppointment({
        clinicId,
        staffId,
        patientId,
        guestPatientId,
        isGuest: !!guestPatientId,
        appointmentType: appointmentType,
        isWalkIn: true,
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
      });

      if (!newAppointment) throw new Error("Failed to create appointment slot.");

      // Step 5: Immediately check in the new walk-in patient
      await checkInPatient(newAppointment.id, staffId);
      
      onSuccess();

    } catch (error: unknown) {
      logger.error('Error adding walk-in', error);
      const description =
        error instanceof Error ? error.message : "Failed to add walk-in patient";
      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Walk-in Patient</DialogTitle>
          <DialogDescription>Add a patient who came without an appointment</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label htmlFor="name">Full Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" disabled={loading} /></div>
          <div><Label htmlFor="phone">Phone Number</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+212..." disabled={loading} /></div>
          <div>
            <Label htmlFor="type">Appointment Type</Label>
            <Select value={appointmentType} onValueChange={setAppointmentType} disabled={loading || appointmentTypes.length === 0}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{appointmentTypes.map((type) => (<SelectItem key={type.name} value={type.name}><div className="flex items-center justify-between w-full"><span>{type.label}</span><span className="text-xs text-muted-foreground ml-4">({type.duration} min)</span></div></SelectItem>))}</SelectContent></Select>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Adding..." : "Add to Queue"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}