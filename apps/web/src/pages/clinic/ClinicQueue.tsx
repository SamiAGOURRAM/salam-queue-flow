import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import { staffService } from "@/services/staff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  UserPlus,
  Calendar,
  XCircle,
  Users,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";
import { EndDayConfirmationDialog } from "@/components/clinic/EndDayConfirmationDialog";
import { logger } from "@/services/shared/logging/Logger";
import { format } from "date-fns";

interface StaffProfile {
  id: string;
}

interface ClinicInfo {
  id: string;
}

export default function ClinicQueue() {
  const { user, loading } = useAuth();
  const { clinic: scopedClinic, loading: accessLoading, can, isClinicOwnerAtClinic } = useClinicPermissions();
  const canManageQueue = can("manage_queue");
  const canManageAppointments = can("manage_appointments");
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [bookingMode, setBookingMode] = useState<'scheduled' | 'walkin'>('scheduled');
  const [showEndDay, setShowEndDay] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueSummary, setQueueSummary] = useState({ waiting: 0, inProgress: 0, absent: 0, completed: 0 });

  const fetchClinicAndStaffData = useCallback(async () => {
    if (!user || !scopedClinic?.id) return;

    try {
      setClinic({ id: scopedClinic.id });

      const staffData = await staffService.getStaffByClinicAndUser(scopedClinic.id, user.id);
      
      if (!staffData) {
        if (isClinicOwnerAtClinic) {
          // Prefer an existing clinic staff row so queue operations can proceed immediately.
          const clinicStaff = await staffService.getStaffByClinic(scopedClinic.id);
          if (clinicStaff[0]) {
            setStaffProfile({ id: clinicStaff[0].id });
            logger.info("Using fallback clinic staff profile for owner queue access", {
              userId: user.id,
              clinicId: scopedClinic.id,
              fallbackStaffId: clinicStaff[0].id,
            });
            return;
          }

          // If the clinic has no staff rows yet, bootstrap one for the owner.
          try {
            const createdOwnerStaff = await staffService.addStaff({
              clinicId: scopedClinic.id,
              userId: user.id,
              role: "doctor",
            });

            setStaffProfile({ id: createdOwnerStaff.id });
            logger.info("Auto-created owner staff profile for queue access", {
              userId: user.id,
              clinicId: scopedClinic.id,
              staffId: createdOwnerStaff.id,
            });
            return;
          } catch (autoCreateError) {
            logger.warn("Failed to auto-create owner staff profile", {
              userId: user.id,
              clinicId: scopedClinic.id,
              reason: autoCreateError instanceof Error ? autoCreateError.message : String(autoCreateError),
            });
          }
        }

        logger.warn("Could not find a staff profile for user in clinic", {
          userId: user.id,
          clinicId: scopedClinic.id,
        });
      } else {
        setStaffProfile({ id: staffData.id });
      }

    } catch (error) {
      logger.error("Error fetching clinic and staff data", error as Error, { userId: user?.id });
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [isClinicOwnerAtClinic, scopedClinic?.id, user]);

  useEffect(() => {
    fetchClinicAndStaffData();
  }, [fetchClinicAndStaffData]);

  if (loading || accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading queue info...</p>
        </div>
      </div>
    );
  }

  if (!scopedClinic?.id) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-16 text-center">
          <p className="font-medium text-foreground mb-1">No Clinic Access</p>
          <p className="text-sm text-muted-foreground">Your account is not linked to a clinic.</p>
        </CardContent>
      </Card>
    );
  }

  if (!canManageQueue) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-16 text-center">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Permission Required</p>
          <p className="text-sm text-muted-foreground">Your role cannot manage the live queue.</p>
        </CardContent>
      </Card>
    );
  }

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
    <div className="space-y-5">
      {/* Header - Compact & Premium */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Live Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>

        {/* Compact Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => {
              setBookingMode('scheduled');
              setShowBookAppointment(true);
            }}
            size="sm"
            disabled={!canManageAppointments}
            className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium"
          >
            <Calendar className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Book</span>
          </Button>

          <Button
            onClick={() => {
              setBookingMode('walkin');
              setShowBookAppointment(true);
            }}
            variant="outline"
            size="sm"
            disabled={!canManageAppointments}
            className="border-border hover:bg-muted h-8 px-3 text-xs font-medium"
          >
            <UserPlus className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Walk-in</span>
          </Button>

          <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

          <Button
            onClick={() => setShowEndDay(true)}
            variant="ghost"
            size="sm"
            disabled={!canManageQueue}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3 text-xs font-medium"
          >
            <XCircle className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">End Day</span>
          </Button>
        </div>
      </div>

      {/* Queue Manager */}
      {clinic?.id && user?.id && staffProfile?.id ? (
        <EnhancedQueueManager
          key={queueRefreshKey}
          clinicId={clinic.id}
          userId={user.id}
          staffId={staffProfile.id}
          onSummaryChange={setQueueSummary}
        />
      ) : clinic?.id && user?.id ? (
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="font-medium text-foreground mb-1">Staff Profile Required</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {isClinicOwnerAtClinic
                ? "As a clinic owner, you need a staff profile to manage the queue."
                : "A staff profile is required. Contact your clinic administrator."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading queue...</p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {clinic?.id && canManageAppointments && (
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
