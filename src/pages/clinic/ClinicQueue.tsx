import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AddWalkInDialog } from "@/components/clinic/AddWalkInDialog";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";

export default function ClinicQueue() {
  const { user, isClinicOwner, isStaff } = useAuth();
  const [clinic, setClinic] = useState<any>(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const fetchClinic = useCallback(async () => {
    try {
      let query = supabase.from("clinics").select("*");

      if (isClinicOwner) {
        query = query.eq("owner_id", user?.id);
      } else if (isStaff) {
        // For staff, get clinic from clinic_staff table
        const { data: staffData } = await supabase
          .from("clinic_staff")
          .select("clinic_id")
          .eq("user_id", user?.id)
          .single();

        if (staffData) {
          query = query.eq("id", staffData.clinic_id);
        }
      }

      const { data } = await query.single();
      if (data) {
        setClinic(data);
      }
    } catch (error) {
      console.error("Error fetching clinic:", error);
    }
  }, [user?.id, isClinicOwner, isStaff]);

  useEffect(() => {
    if (user && (isClinicOwner || isStaff)) {
      fetchClinic();
    }
  }, [user, isClinicOwner, isStaff, fetchClinic]);

  return (
    <div className="space-y-8">
      {/* Page Header with Date and Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Today's Queue</h2>
          <p className="text-base text-muted-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              year: "numeric", 
              month: "long", 
              day: "numeric" 
            })}
          </p>
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-3 w-full sm:w-auto">
          <Button 
            onClick={() => setShowBookAppointment(true)} 
            size="lg"
            className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Book Appointment
          </Button>
          <Button 
            onClick={() => setShowAddWalkIn(true)} 
            variant="outline"
            size="lg"
            className="flex-1 sm:flex-none border-2 hover:border-blue-400 hover:bg-blue-50 shadow-sm"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Add Walk-in
          </Button>
        </div>
      </div>

      {/* Enhanced Queue Manager */}
      {clinic?.id && user?.id && (
        <EnhancedQueueManager 
          key={queueRefreshKey}
          clinicId={clinic.id} 
          userId={user.id}
        />
      )}

      {/* Dialogs */}
      <AddWalkInDialog
        open={showAddWalkIn}
        onOpenChange={setShowAddWalkIn}
        clinicId={clinic?.id}
        onSuccess={() => {
          setShowAddWalkIn(false);
          setQueueRefreshKey(prev => prev + 1);
          toast({
            title: "Success",
            description: "Walk-in patient added to queue",
          });
        }}
      />

      <BookAppointmentDialog
        open={showBookAppointment}
        onOpenChange={setShowBookAppointment}
        clinicId={clinic?.id}
        onSuccess={() => {
          setShowBookAppointment(false);
          setQueueRefreshKey(prev => prev + 1);
          toast({
            title: "Success", 
            description: "Appointment booked successfully",
          });
        }}
      />
    </div>
  );
}