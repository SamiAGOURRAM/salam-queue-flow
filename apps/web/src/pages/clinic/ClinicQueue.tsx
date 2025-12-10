/**
 * ClinicQueue Page (DEBUGGING VERSION WITH ENHANCED STYLING)
 * This version adds console logs to trace the fetching of clinicId and staffId.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { Button } from "@/components/ui/button";
import { UserPlus, Calendar, XCircle, Users, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";
import { EndDayConfirmationDialog } from "@/components/clinic/EndDayConfirmationDialog";
// Removed duplicate useQueueService - EnhancedQueueManager already uses it
import { AppointmentStatus, SkipReason } from "@/services/queue";
import { logger } from "@/services/shared/logging/Logger";

interface StaffProfile {
  id: string; // This is the staff_id
}

interface ClinicInfo {
  id: string;
}

export default function ClinicQueue() {
  const { user, isClinicOwner, isStaff } = useAuth();
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [bookingMode, setBookingMode] = useState<'scheduled' | 'walkin'>('scheduled');
  const [showEndDay, setShowEndDay] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueSummary, setQueueSummary] = useState({ waiting: 0, inProgress: 0, absent: 0, completed: 0 });

  // Don't duplicate useQueueService here - EnhancedQueueManager already has it
  // Just get the summary from EnhancedQueueManager via callback

  const fetchClinicAndStaffData = useCallback(async () => {
    if (!user || (!isClinicOwner && !isStaff)) return;

    try {
      let clinicId: string | null = null;
      
      // Try clinic owner path first
      if (isClinicOwner) {
        logger.debug("Attempting to fetch clinic by owner", { userId: user.id });
        const ownerClinic = await clinicService.getClinicByOwner(user.id);
        if (ownerClinic) {
          clinicId = ownerClinic.id;
          logger.debug("Found clinic by owner", { clinicId, userId: user.id });
        } else {
          logger.warn("User is clinic owner but no clinic found with this owner_id", { userId: user.id });
        }
      }
      
      // If clinic owner path didn't work, try staff path as fallback
      // (Some users might be both owner and staff, or owner role might be misconfigured)
      if (!clinicId && isStaff) {
        logger.debug("Attempting to fetch clinic via staff path", { userId: user.id });
        const staffData = await staffService.getStaffByUser(user.id);
        if (staffData) {
          clinicId = staffData.clinicId;
          logger.debug("Found clinic via staff", { clinicId, userId: user.id });
        }
      }

      if (!clinicId) {
        const errorMsg = "Could not determine the clinic for your account. " +
          (isClinicOwner && isStaff 
            ? "Please ensure you have a clinic assigned as owner or a staff profile." 
            : isClinicOwner 
            ? "Please ensure you have a clinic assigned as owner in the clinics table." 
            : "Please ensure you have a staff profile assigned to a clinic.");
        logger.error("Could not determine clinic", { userId: user.id, isClinicOwner, isStaff });
        throw new Error(errorMsg);
      }
      
      setClinic({ id: clinicId });

      // Use StaffService to get staff by clinic and user
      // For clinic owners, they might also need a staff profile to use the queue
      const staffData = await staffService.getStaffByClinicAndUser(clinicId, user.id);
      
        if (!staffData) {
        // This is a warning, not a hard error - clinic owners might not have staff profiles
        logger.warn("Could not find a staff profile for user in clinic", { 
          userId: user.id, 
          clinicId,
          isClinicOwner,
          isStaff 
        });
        // Don't set staffProfile - leave it null so UI can show appropriate message
        // The queue manager requires a staffId, so we can't proceed without it
      } else {
        setStaffProfile({ id: staffData.id });
      }

    } catch (error) {
      logger.error("Error fetching clinic and staff data", error as Error, { userId: user?.id });
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [user, isClinicOwner, isStaff]);

  useEffect(() => {
    fetchClinicAndStaffData();
  }, [fetchClinicAndStaffData]);

  const handleSuccess = () => {
    setShowBookAppointment(false);
    setBookingMode('scheduled');
    setQueueRefreshKey(prev => prev + 1);
    toast({
      title: "Success",
      description: "The queue has been updated.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Clean Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Today's Queue</h1>
          <div className="flex items-center gap-2 text-base text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <Button 
            onClick={() => {
              setBookingMode('scheduled');
              setShowBookAppointment(true);
            }} 
            size="lg" 
            className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all rounded-xl"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Book Appointment
          </Button>

          <Button 
            onClick={() => {
              setBookingMode('walkin');
              setShowBookAppointment(true);
            }} 
            variant="outline"
            size="lg" 
            className="flex-1 sm:flex-none border-2 hover:border-blue-400 hover:bg-blue-50 shadow-sm rounded-xl transition-all"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Add Walk-in
          </Button>

          <Button 
            onClick={() => setShowEndDay(true)} 
            variant="outline"
            size="lg" 
            className="flex-1 sm:flex-none border-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 shadow-sm rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5 mr-2" />
            End Day
          </Button>
        </div>
      </div>

      {/* Enhanced Queue Manager */}
      <div className="relative">
        {clinic?.id && user?.id && staffProfile?.id ? (
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-gray-100">
            <EnhancedQueueManager 
              key={queueRefreshKey}
              clinicId={clinic.id} 
              userId={user.id}
              staffId={staffProfile.id}
              onSummaryChange={setQueueSummary}
            />
          </div>
        ) : clinic?.id && user?.id ? (
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Staff Profile Required</h3>
            <p className="text-gray-500 mb-4">
              {isClinicOwner 
                ? "As a clinic owner, you need a staff profile to manage the queue. Please contact support to set up your staff profile."
                : "A staff profile is required to manage the queue. Please contact your clinic administrator."}
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Users className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Loading Queue Manager</h3>
            <p className="text-gray-500">Waiting for Clinic and Staff IDs...</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {clinic?.id && (
        <BookAppointmentDialog
          open={showBookAppointment}
          onOpenChange={(open) => {
            setShowBookAppointment(open);
            if (!open) setBookingMode('scheduled');
          }}
          clinicId={clinic.id}
          onSuccess={handleSuccess}
          preselectedDate={bookingMode === 'walkin' ? new Date() : undefined}
          defaultReason={bookingMode === 'walkin' ? 'Walk-in patient' : undefined}
          isWalkIn={bookingMode === 'walkin'}
          title={bookingMode === 'walkin' ? 'Add Walk-in Patient' : undefined}
          description={bookingMode === 'walkin' ? 'Schedule a patient who arrived without an appointment.' : undefined}
        />
      )}
      <EndDayConfirmationDialog
        open={showEndDay}
        onOpenChange={setShowEndDay}
        clinicId={clinic?.id || ''}
        staffId={staffProfile?.id || ''}
        userId={user?.id || ''}
        onSuccess={handleSuccess}
        summary={queueSummary}
      />
    </div>
  );
}