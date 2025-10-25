/**
 * ClinicQueue Page (DEBUGGING VERSION)
 * This version adds console logs to trace the fetching of clinicId and staffId.
 */
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AddWalkInDialog } from "@/components/clinic/AddWalkInDialog";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";

interface StaffProfile {
  id: string; // This is the staff_id
}

export default function ClinicQueue() {
  const { user, isClinicOwner, isStaff } = useAuth();
  const [clinic, setClinic] = useState<any>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const fetchClinicAndStaffData = useCallback(async () => {
    // --- DEBUG LOG 1: Check if the function starts and who the user is ---
    console.log("DEBUG: Starting fetchClinicAndStaffData. User:", user?.id, "isClinicOwner:", isClinicOwner, "isStaff:", isStaff);

    if (!user || (!isClinicOwner && !isStaff)) return;

    try {
      let clinicId: string | null = null;
      if (isClinicOwner) {
        const { data: ownerClinic } = await supabase.from("clinics").select("id").eq("owner_id", user.id).single();
        if (ownerClinic) clinicId = ownerClinic.id;
      } else if (isStaff) {
        const { data: staffClinic } = await supabase.from("clinic_staff").select("clinic_id").eq("user_id", user.id).single();
        if (staffClinic) clinicId = staffClinic.clinic_id;
      }
      
      // --- DEBUG LOG 2: Check the result of fetching the clinicId ---
      console.log("DEBUG: Fetched clinicId:", clinicId);

      if (!clinicId) throw new Error("Could not determine the clinic for your account.");
      
      setClinic({ id: clinicId });

      const { data: staffData, error: staffError } = await supabase
        .from("clinic_staff")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("user_id", user.id)
        .single();
      
      if (staffError || !staffData) {
        throw new Error(staffError?.message || "Could not find a staff profile for your account in this clinic.");
      }

      // --- DEBUG LOG 3: Check the final staffId before setting state ---
      console.log("DEBUG: Fetched staffId:", staffData?.id);
      setStaffProfile(staffData);

    } catch (error) {
      console.error("DEBUG: Error in fetchClinicAndStaffData:", error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [user, isClinicOwner, isStaff]);

  useEffect(() => {
    fetchClinicAndStaffData();
  }, [fetchClinicAndStaffData]);

  const handleSuccess = () => {
    setShowAddWalkIn(false);
    setShowBookAppointment(false);
    setQueueRefreshKey(prev => prev + 1);
    toast({
      title: "Success",
      description: "The queue has been updated.",
    });
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Today's Queue</h2>
          <p className="text-base text-muted-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button onClick={() => setShowBookAppointment(true)} size="lg" className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"><Calendar className="w-5 h-5 mr-2" />Book Appointment</Button>
          <Button onClick={() => setShowAddWalkIn(true)} variant="outline" size="lg" className="flex-1 sm:flex-none border-2 hover:border-blue-400 hover:bg-blue-50 shadow-sm"><UserPlus className="w-5 h-5 mr-2" />Add Walk-in</Button>
        </div>
      </div>

      {/* Enhanced Queue Manager */}
      {clinic?.id && user?.id && staffProfile?.id ? (
        <EnhancedQueueManager 
          key={queueRefreshKey}
          clinicId={clinic.id} 
          userId={user.id}
          staffId={staffProfile.id}
        />
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">Loading queue manager... (Waiting for Clinic and Staff IDs)</p>
        </div>
      )}

      {/* Dialogs */}
      <AddWalkInDialog
        open={showAddWalkIn}
        onOpenChange={setShowAddWalkIn}
        clinicId={clinic?.id}
        staffId={staffProfile?.id}
        onSuccess={handleSuccess}
      />
      <BookAppointmentDialog
        open={showBookAppointment}
        onOpenChange={setShowBookAppointment}
        clinicId={clinic?.id}
        staffId={staffProfile?.id}
        onSuccess={handleSuccess}
      />
    </div>
  );
}