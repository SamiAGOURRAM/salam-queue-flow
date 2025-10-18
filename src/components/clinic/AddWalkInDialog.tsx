import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logger } from "@/services/shared/logging/Logger";

interface AddWalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSuccess: () => void;
}

interface AppointmentType {
  name: string;
  label: string;
  duration: number;
}

interface ClinicSettings {
  appointment_types?: AppointmentType[];
}

export function AddWalkInDialog({ open, onOpenChange, clinicId, onSuccess }: AddWalkInDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);

  // Fetch clinic settings when dialog opens
  useEffect(() => {
    if (open && clinicId) {
      fetchClinicSettings();
    }
  }, [open, clinicId]);

  const fetchClinicSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("clinics")
        .select("settings")
        .eq("id", clinicId)
        .single();

      if (error) throw error;

      const settings = data?.settings as ClinicSettings;
      
      // Get appointment types from settings or use defaults
      const types = settings?.appointment_types && settings.appointment_types.length > 0
        ? settings.appointment_types
        : [
            { name: "consultation", label: "Consultation", duration: 15 },
            { name: "follow_up", label: "Follow-up", duration: 10 },
            { name: "emergency", label: "Emergency", duration: 30 },
            { name: "vaccination", label: "Vaccination", duration: 15 },
            { name: "test", label: "Test", duration: 20 },
          ];

      setAppointmentTypes(types);
      
      // Set first type as default if not already set
      if (!appointmentType && types.length > 0) {
        setAppointmentType(types[0].name);
      }
    } catch (error) {
      logger.error("Error fetching clinic settings", error);
      // Use default types on error
      const defaultTypes = [
        { name: "consultation", label: "Consultation", duration: 15 },
        { name: "follow_up", label: "Follow-up", duration: 10 },
        { name: "emergency", label: "Emergency", duration: 30 },
      ];
      setAppointmentTypes(defaultTypes);
      setAppointmentType(defaultTypes[0].name);
    }
  };

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
      logger.info('Adding walk-in patient', { name, phone: cleanPhone, clinicId });

      // Step 1: Check if this is a registered user
      let patientId = null;
      let guestPatientId = null;
      let isGuest = false;

      const { data: registeredPatient } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (registeredPatient) {
        // Use registered patient
        patientId = registeredPatient.id;
        isGuest = false;
        logger.debug('Found registered patient', { patientId });
        
        toast({
          title: "Patient Found",
          description: `Adding ${registeredPatient.full_name} to queue`,
        });
      } else {
        // Check if guest exists
        const { data: existingGuest } = await supabase
          .from("guest_patients")
          .select("id, full_name")
          .eq("phone_number", cleanPhone)
          .is("claimed_by", null)
          .maybeSingle();

        if (existingGuest) {
          guestPatientId = existingGuest.id;
          isGuest = true;
          logger.debug('Found existing guest', { guestPatientId });
        } else {
          // Create new guest patient (NO AUTH ACCOUNT)
          const { data: newGuest, error: guestError } = await supabase
            .from("guest_patients")
            .insert({
              full_name: name.trim(),
              phone_number: cleanPhone
            })
            .select('id')
            .single();

          if (guestError) {
            throw new Error(`Failed to create guest: ${guestError.message}`);
          }

          guestPatientId = newGuest.id;
          isGuest = true;
          logger.info('Created new guest patient', { guestPatientId });
        }

        toast({
          title: "Walk-in Patient",
          description: `Adding ${name} to queue`,
        });
      }

      // Step 2: Get current user as staff (clinic owner can be staff)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in");
      }

      // Try to find clinic staff, fallback to current user (owner)
      const { data: staff } = await supabase
        .from("clinic_staff")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      let staffId = staff?.id;

      // If no staff record, create one for the owner
      if (!staffId) {
        const { data: newStaff, error: staffError } = await supabase
          .from("clinic_staff")
          .insert({
            clinic_id: clinicId,
            user_id: user.id,
            role: 'doctor',
            is_active: true
          })
          .select('id')
          .single();

        if (staffError) {
          logger.error('Failed to create staff record', staffError);
          throw new Error("Could not assign staff");
        }

        staffId = newStaff.id;
        logger.info('Created staff record for owner', { staffId });
      }

      // Step 3: Create appointment
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const appointmentData: any = {
        clinic_id: clinicId,
        staff_id: staffId,
        appointment_date: today,
        appointment_type: appointmentType,
        is_walk_in: true,
        is_guest: isGuest,
        status: 'waiting',
        booked_by: user.id,
        booking_method: 'clinic_staff'
      };

      if (isGuest) {
        appointmentData.guest_patient_id = guestPatientId;
        appointmentData.patient_id = null;
      } else {
        appointmentData.patient_id = patientId;
        appointmentData.guest_patient_id = null;
      }

      const { data: appointment, error: apptError } = await supabase
        .from("appointments")
        .insert(appointmentData)
        .select('id, queue_position')
        .single();

      if (apptError) {
        logger.error('Failed to create appointment', apptError);
        throw new Error(`Failed to create appointment: ${apptError.message}`);
      }

      logger.info('Walk-in appointment created', { appointmentId: appointment.id });

      toast({
        title: "Success!",
        description: `${name} added to queue at position ${appointment.queue_position || 'N/A'}`,
      });

      // Reset form
      setName("");
      setPhone("");
      setAppointmentType(appointmentTypes.length > 0 ? appointmentTypes[0].name : "");
      
      onSuccess();
      onOpenChange(false);

    } catch (error: any) {
      logger.error('Error adding walk-in', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add walk-in patient",
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
            Add a patient who came without an appointment
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Patient name"
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212..."
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="type">Appointment Type</Label>
            <Select 
              value={appointmentType} 
              onValueChange={setAppointmentType} 
              disabled={loading || appointmentTypes.length === 0}
            >
              <SelectTrigger>
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
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