import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { clinicService } from "@/services/clinic";
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
  const { user, isClinicOwner, isStaff } = useAuth();
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [bookingMode, setBookingMode] = useState<'scheduled' | 'walkin'>('scheduled');
  const [showEndDay, setShowEndDay] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueSummary, setQueueSummary] = useState({ waiting: 0, inProgress: 0, absent: 0, completed: 0 });

  const fetchClinicAndStaffData = useCallback(async () => {
    if (!user || (!isClinicOwner && !isStaff)) return;

    try {
      let clinicId: string | null = null;
      
      if (isClinicOwner) {
        logger.debug("Attempting to fetch clinic by owner", { userId: user.id });
        const ownerClinic = await clinicService.getClinicByOwner(user.id);
        if (ownerClinic) {
          clinicId = ownerClinic.id;
          logger.debug("Found clinic by owner", { clinicId, userId: user.id });
        }
      }
      
      if (!clinicId && isStaff) {
        logger.debug("Attempting to fetch clinic via staff path", { userId: user.id });
        const staffData = await staffService.getStaffByUser(user.id);
        if (staffData) {
          clinicId = staffData.clinicId;
          logger.debug("Found clinic via staff", { clinicId, userId: user.id });
        }
      }

      if (!clinicId) {
        const errorMsg = "Could not determine the clinic for your account.";
        logger.error("Could not determine clinic", { userId: user.id, isClinicOwner, isStaff });
        throw new Error(errorMsg);
      }
      
      setClinic({ id: clinicId });

      const staffData = await staffService.getStaffByClinicAndUser(clinicId, user.id);
      
      if (!staffData) {
        logger.warn("Could not find a staff profile for user in clinic", { 
          userId: user.id, 
          clinicId,
          isClinicOwner,
          isStaff 
        });
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
    <div className="space-y-5">
      {/* Header - Compact & Premium */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Live Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>

        {/* Compact Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setBookingMode('scheduled');
              setShowBookAppointment(true);
            }}
            size="sm"
            className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Book
          </Button>

          <Button
            onClick={() => {
              setBookingMode('walkin');
              setShowBookAppointment(true);
            }}
            variant="outline"
            size="sm"
            className="border-border hover:bg-muted h-8 px-3 text-xs font-medium"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Walk-in
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          <Button
            onClick={() => setShowEndDay(true)}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3 text-xs font-medium"
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            End Day
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
              {isClinicOwner
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
