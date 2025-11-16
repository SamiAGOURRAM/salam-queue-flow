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
import { UserPlus, Calendar, XCircle, Sparkles, Clock, Users, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AddWalkInDialog } from "@/components/clinic/AddWalkInDialog";
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
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [showEndDay, setShowEndDay] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueSummary, setQueueSummary] = useState({ waiting: 0, inProgress: 0, absent: 0, completed: 0 });

  // Don't duplicate useQueueService here - EnhancedQueueManager already has it
  // Just get the summary from EnhancedQueueManager via callback

  const fetchClinicAndStaffData = useCallback(async () => {
    if (!user || (!isClinicOwner && !isStaff)) return;

    try {
      let clinicId: string | null = null;
      if (isClinicOwner) {
        // Use ClinicService to get clinic by owner
        const ownerClinic = await clinicService.getClinicByOwner(user.id);
        if (ownerClinic) clinicId = ownerClinic.id;
      } else if (isStaff) {
        // Use StaffService to get staff, then extract clinicId
        const staffData = await staffService.getStaffByUser(user.id);
        if (staffData) clinicId = staffData.clinicId;
      }

      if (!clinicId) throw new Error("Could not determine the clinic for your account.");
      
      setClinic({ id: clinicId });

      // Use StaffService to get staff by clinic and user
      const staffData = await staffService.getStaffByClinicAndUser(clinicId, user.id);
      
      if (!staffData) {
        throw new Error("Could not find a staff profile for your account in this clinic.");
      }

      setStaffProfile({ id: staffData.id });

    } catch (error) {
      logger.error("Error fetching clinic and staff data", error as Error, { userId: user?.id });
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
            onClick={() => setShowBookAppointment(true)} 
            size="lg" 
            className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all rounded-xl"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Book Appointment
          </Button>

          <Button 
            onClick={() => setShowAddWalkIn(true)} 
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

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-blue-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Waiting</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 group-hover:scale-110 transition-transform">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {queueSummary.waiting}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-green-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Active</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-100 to-emerald-200 group-hover:scale-110 transition-transform">
                <Activity className="w-4 h-4 text-green-600 animate-pulse" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {queueSummary.inProgress}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Absent</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-100 to-amber-200 group-hover:scale-110 transition-transform">
                <Users className="w-4 h-4 text-orange-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              {queueSummary.absent}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-purple-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Completed</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 group-hover:scale-110 transition-transform">
                <Sparkles className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {queueSummary.completed}
            </div>
          </div>
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