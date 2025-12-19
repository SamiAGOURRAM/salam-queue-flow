import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  UserPlus, 
  Calendar, 
  XCircle, 
  Users, 
  AlertCircle,
  Clock,
  CheckCircle2,
  Play,
  MoreVertical,
  ArrowRight,
  Phone,
  Mail
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";
import { EndDayConfirmationDialog } from "@/components/clinic/EndDayConfirmationDialog";
import { AppointmentStatus, SkipReason } from "@/services/queue";
import { logger } from "@/services/shared/logging/Logger";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground-primary">Live Queue</h1>
          <div className="flex items-center gap-2 text-sm text-foreground-muted">
            <Calendar className="w-4 h-4" />
            <span>
              {format(new Date(), "EEEE, MMMM d, yyyy")}
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
            className="flex-1 sm:flex-none bg-primary hover:bg-primary-600 shadow-md hover:shadow-lg transition-all rounded-xl"
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
            className="flex-1 sm:flex-none border-2 border-border/80 hover:border-primary/40 hover:bg-primary-50/30 hover:shadow-sm rounded-xl transition-all"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Add Walk-in
          </Button>

          <Button 
            onClick={() => setShowEndDay(true)} 
            variant="outline"
            size="lg" 
            className="flex-1 sm:flex-none border-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 hover:shadow-sm rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5 mr-2" />
            End Day
          </Button>
        </div>
      </div>

      {/* Enhanced Queue Manager */}
      <div className="relative">
        {clinic?.id && user?.id && staffProfile?.id ? (
          <EnhancedQueueManager 
            key={queueRefreshKey}
            clinicId={clinic.id} 
            userId={user.id}
            staffId={staffProfile.id}
            onSummaryChange={setQueueSummary}
          />
        ) : clinic?.id && user?.id ? (
          <Card className="border-2 border-border/80 shadow-md">
            <CardContent className="p-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-warning" />
              </div>
              <h3 className="text-xl font-bold text-foreground-primary mb-2">Staff Profile Required</h3>
              <p className="text-foreground-muted mb-4">
                {isClinicOwner 
                  ? "As a clinic owner, you need a staff profile to manage the queue. Please contact support to set up your staff profile."
                  : "A staff profile is required to manage the queue. Please contact your clinic administrator."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-border/80 shadow-md">
            <CardContent className="p-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <Users className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground-primary mb-2">Loading Queue Manager</h3>
              <p className="text-foreground-muted">Waiting for Clinic and Staff IDs...</p>
            </CardContent>
          </Card>
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
