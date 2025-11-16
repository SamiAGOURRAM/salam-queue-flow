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
import { toast } from "@/hooks/use-toast";
import { logger } from "@/services/shared/logging/Logger";
import { useQueueService } from "@/hooks/useQueueService";
import { patientService } from "@/services/patient";
import { clinicService } from "@/services/clinic";

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
      // Use ClinicService instead of direct Supabase call
      const settings = await clinicService.getClinicSettings(clinicId);
      const types = (settings.appointment_types as AppointmentType[]) || [];
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
      // Use PatientService to find or create patient (handles both registered and guest patients)
      const patientResult = await patientService.findOrCreatePatient(phone, name);
      
      const patientId = patientResult.patientId;
      const guestPatientId = patientResult.guestPatientId;
      
      logger.info('Patient lookup result', { 
        patientId, 
        guestPatientId, 
        isGuest: patientResult.isGuest,
        isNew: patientResult.isNew 
      });
      
      // Step 2: Prepare the DTO for the `createAppointment` service
      const selectedType = appointmentTypes.find(t => t.name === appointmentType);
      const duration = selectedType?.duration || 15;
      const now = new Date();
      const endTime = new Date(now.getTime() + duration * 60000);

      // Step 3: Call the `createAppointment` service
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

      // Step 4: Immediately check in the new walk-in patient
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