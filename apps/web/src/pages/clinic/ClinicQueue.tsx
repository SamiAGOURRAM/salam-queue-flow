import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import { useClinicResources } from "@/hooks/useClinicResources";
import { useQueueScope } from "@/hooks/useQueueScope";
import { staffService, type StaffProfile as StaffMember } from "@/services/staff";
import type { QueueEntry } from "@/services/queue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ResourceOccupancyPanel } from "@/components/clinic/ResourceOccupancyPanel";
import { logger } from "@/services/shared/logging/Logger";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

interface CurrentStaffProfile {
  id: string;
}

interface ClinicInfo {
  id: string;
}

interface QueueDoctorOption {
  staffId: string;
  displayName: string;
}

type ProfileNameRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name">;
type OwnerQueueSelection = 'clinic' | 'personal' | `doctor:${string}`;

export default function ClinicQueue() {
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();
  const { clinic: scopedClinic, loading: accessLoading, can, isClinicOwnerAtClinic } = useClinicPermissions();
  const userId = user?.id;
  const scopedClinicId = scopedClinic?.id;
  const canManageQueue = can("manage_queue");
  const canManageAppointments = can("manage_appointments");
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [staffProfile, setStaffProfile] = useState<CurrentStaffProfile | null>(null);
  const [doctorQueueOptions, setDoctorQueueOptions] = useState<QueueDoctorOption[]>([]);
  const [ownerQueueSelection, setOwnerQueueSelection] = useState<OwnerQueueSelection>('clinic');
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [bookingMode, setBookingMode] = useState<'scheduled' | 'walkin'>('scheduled');
  const [showEndDay, setShowEndDay] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueSchedule, setQueueSchedule] = useState<QueueEntry[]>([]);
  const [queueSummary, setQueueSummary] = useState({ waiting: 0, inProgress: 0, absent: 0, completed: 0 });
  const { resources, loading: resourcesLoading, refresh: refreshResources } = useClinicResources(clinic?.id);
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const todayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const {
    loading: queueScopeLoading,
    error: queueScopeError,
    resolvedScope,
    canSwitchQueueScope,
    useClinicWide: useClinicWideQueue,
    allowedStaffIds,
  } = useQueueScope({
    clinicId: clinic?.id,
    staffId: staffProfile?.id,
  });

  const isScopeReadyForNonOwnerStaff = useMemo(() => {
    if (isClinicOwnerAtClinic) {
      return true;
    }

    if (!staffProfile?.id) {
      return false;
    }

    // If scope resolution fails, we still allow rendering in safe personal mode.
    if (queueScopeError) {
      return true;
    }

    return resolvedScope.requesterStaffId === staffProfile.id;
  }, [isClinicOwnerAtClinic, queueScopeError, resolvedScope.requesterStaffId, staffProfile?.id]);

  const shouldForcePersonalFallbackScope =
    !isClinicOwnerAtClinic && Boolean(staffProfile?.id) && Boolean(queueScopeError);

  const fetchClinicAndStaffData = useCallback(async () => {
    if (!userId || !scopedClinicId) return;

    try {
      setClinic((previousClinic) =>
        previousClinic?.id === scopedClinicId ? previousClinic : { id: scopedClinicId }
      );

      const staffData = await staffService.getStaffByClinicAndUser(scopedClinicId, userId);
      
      if (!staffData) {
        setStaffProfile(null);

        logger.warn("Could not find a staff profile for user in clinic", {
          userId,
          clinicId: scopedClinicId,
        });
      } else {
        setStaffProfile((previousStaffProfile) =>
          previousStaffProfile?.id === staffData.id ? previousStaffProfile : { id: staffData.id }
        );
      }

    } catch (error) {
      logger.error("Error fetching clinic and staff data", error as Error, { userId });
      toast({ title: t("clinicQueue.toasts.errorTitle"), description: (error as Error).message, variant: "destructive" });
    }
  }, [scopedClinicId, t, userId]);

  const fetchDoctorQueueOptions = useCallback(async () => {
    const applyDoctorOptions = (nextOptions: QueueDoctorOption[]) => {
      setDoctorQueueOptions((previousOptions) => {
        const unchanged =
          previousOptions.length === nextOptions.length &&
          previousOptions.every((option, index) => {
            const nextOption = nextOptions[index];
            return (
              nextOption &&
              option.staffId === nextOption.staffId &&
              option.displayName === nextOption.displayName
            );
          });

        return unchanged ? previousOptions : nextOptions;
      });
    };

    if (!scopedClinicId || !canSwitchQueueScope) {
      applyDoctorOptions([]);
      return;
    }

    try {
      const clinicStaff: StaffMember[] = await staffService.getStaffByClinic(scopedClinicId);
      const doctors = clinicStaff.filter(
        (member) => member.role.toLowerCase().includes("doctor") && member.isActive
      );

      const selectableDoctors = staffProfile?.id
        ? doctors.filter((doctor) => doctor.id !== staffProfile.id)
        : doctors;

      if (selectableDoctors.length === 0) {
        applyDoctorOptions([]);
        return;
      }

      const userIds = [...new Set(selectableDoctors.map((doctor) => doctor.userId))];
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profileError) {
        throw profileError;
      }

      const profileRows = (profileData as ProfileNameRow[] | null) ?? [];
      const profileNameByUserId = new Map<string, string>();
      for (const profileRow of profileRows) {
        const fullName = profileRow.full_name?.trim() ?? "";
        if (fullName.length > 0) {
          profileNameByUserId.set(profileRow.id, fullName);
        }
      }

      let fallbackCounter = 1;
      const options = selectableDoctors
        .map((doctor) => {
          const profileName = profileNameByUserId.get(doctor.userId);
          const fallbackName = t("clinicQueue.doctorQueues.fallbackDoctor", "Doctor {{count}}", {
            count: fallbackCounter,
          });

          if (!profileName) {
            fallbackCounter += 1;
          }

          return {
            staffId: doctor.id,
            displayName: profileName || fallbackName,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      applyDoctorOptions(options);
    } catch (error) {
      logger.error("Failed to load doctor queue options", error as Error, { clinicId: scopedClinicId });
      applyDoctorOptions([]);
    }
  }, [canSwitchQueueScope, scopedClinicId, staffProfile?.id, t]);

  useEffect(() => {
    fetchClinicAndStaffData();
  }, [fetchClinicAndStaffData]);

  useEffect(() => {
    void fetchDoctorQueueOptions();
  }, [fetchDoctorQueueOptions]);

  useEffect(() => {
    if (!canSwitchQueueScope) return;

    if (ownerQueueSelection === 'personal' && !staffProfile?.id) {
      setOwnerQueueSelection('clinic');
      return;
    }

    if (ownerQueueSelection.startsWith('doctor:')) {
      const doctorStaffId = ownerQueueSelection.slice('doctor:'.length);
      if (!doctorQueueOptions.some((option) => option.staffId === doctorStaffId)) {
        setOwnerQueueSelection('clinic');
      }
    }
  }, [canSwitchQueueScope, doctorQueueOptions, ownerQueueSelection, staffProfile?.id]);

  const selectedDoctorQueueStaffId = useMemo(
    () =>
    canSwitchQueueScope && ownerQueueSelection.startsWith('doctor:')
      ? ownerQueueSelection.slice('doctor:'.length)
      : null,
    [canSwitchQueueScope, ownerQueueSelection]
  );

  const effectiveUseClinicWideQueue = useMemo(
    () => {
      if (shouldForcePersonalFallbackScope) {
        return false;
      }

      return canSwitchQueueScope ? ownerQueueSelection !== 'personal' : useClinicWideQueue;
    },
    [canSwitchQueueScope, ownerQueueSelection, shouldForcePersonalFallbackScope, useClinicWideQueue]
  );

  const effectiveAllowedStaffIds = useMemo(() => {
    if (shouldForcePersonalFallbackScope) {
      return staffProfile?.id ? [staffProfile.id] : undefined;
    }

    if (!canSwitchQueueScope) {
      return allowedStaffIds;
    }

    if (selectedDoctorQueueStaffId) {
      return [selectedDoctorQueueStaffId];
    }

    if (ownerQueueSelection === 'personal') {
      return staffProfile?.id ? [staffProfile.id] : undefined;
    }

    return undefined;
  }, [
    allowedStaffIds,
    canSwitchQueueScope,
    ownerQueueSelection,
    selectedDoctorQueueStaffId,
    shouldForcePersonalFallbackScope,
    staffProfile?.id,
  ]);

  const shouldShowScopeLoading = queueScopeLoading || !isScopeReadyForNonOwnerStaff;

  const handleQueueViewSelectionChange = (value: string) => {
    if (value === 'clinic' || value === 'personal' || value.startsWith('doctor:')) {
      const nextSelection = value as OwnerQueueSelection;

      // UX: clicking the active doctor quick card returns to the general clinic queue.
      if (nextSelection === ownerQueueSelection && nextSelection.startsWith('doctor:')) {
        setOwnerQueueSelection('clinic');
        return;
      }

      setOwnerQueueSelection(nextSelection);
    }
  };

  if (loading || accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">{t("clinicQueue.loading.queueInfo")}</p>
        </div>
      </div>
    );
  }

  if (!scopedClinic?.id) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-16 text-center">
          <p className="font-medium text-foreground mb-1">{t("clinicQueue.access.noClinicTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("clinicQueue.access.noClinicDescription")}</p>
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
          <p className="font-medium text-foreground mb-1">{t("clinicQueue.access.permissionTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("clinicQueue.access.permissionDescription")}</p>
        </CardContent>
      </Card>
    );
  }

  const handleSuccess = () => {
    setShowBookAppointment(false);
    setBookingMode('scheduled');
    setQueueRefreshKey(prev => prev + 1);
    void refreshResources();
    toast({
      title: t("clinicQueue.toasts.successTitle"),
      description: t("clinicQueue.toasts.queueUpdated"),
    });
  };

  const canRenderQueueManager = Boolean(
    clinic?.id &&
    user?.id &&
    (staffProfile?.id || (isClinicOwnerAtClinic && effectiveUseClinicWideQueue))
  );

  return (
    <div className="space-y-5">
      {/* Header - Compact & Premium */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">{t("clinicQueue.header.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todayLabel}
          </p>
          {canSwitchQueueScope && (
            <div className="space-y-2 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("clinicQueue.scope.label")}</span>
                <Select
                  value={ownerQueueSelection}
                  onValueChange={handleQueueViewSelectionChange}
                >
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinic">{t("clinicQueue.scope.clinic")}</SelectItem>
                    {staffProfile?.id && (
                      <SelectItem value="personal">{t("clinicQueue.scope.personal")}</SelectItem>
                    )}
                    {doctorQueueOptions.map((doctorOption) => (
                      <SelectItem key={doctorOption.staffId} value={`doctor:${doctorOption.staffId}`}>
                        {t("clinicQueue.doctorQueues.doctorOption", "{{name}} queue", {
                          name: doctorOption.displayName,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {doctorQueueOptions.length > 0 && (
                <div className="space-y-1.5 max-w-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    {t("clinicQueue.doctorQueues.title", "Doctor queues")}
                  </p>
                  {doctorQueueOptions.map((doctorOption) => {
                    const selectionValue = `doctor:${doctorOption.staffId}`;
                    const isSelected = ownerQueueSelection === selectionValue;

                    return (
                      <button
                        key={doctorOption.staffId}
                        type="button"
                        onClick={() => handleQueueViewSelectionChange(selectionValue)}
                        className="w-full rounded-md border border-border/70 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                      >
                        <span className="block text-sm font-medium text-foreground">{doctorOption.displayName}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {isSelected
                            ? t("clinicQueue.doctorQueues.viewingNow", "Viewing now")
                            : t("clinicQueue.doctorQueues.openDoctorQueue", "Open {{name}} queue", {
                                name: doctorOption.displayName,
                              })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
            <span className="hidden sm:inline">{t("clinicQueue.header.book")}</span>
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
            <span className="hidden sm:inline">{t("clinicQueue.header.walkIn")}</span>
          </Button>

          <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

          <Button
            onClick={() => setShowEndDay(true)}
            variant="ghost"
            size="sm"
            disabled={!canManageQueue || !staffProfile?.id}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3 text-xs font-medium"
          >
            <XCircle className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t("clinicQueue.header.endDay")}</span>
          </Button>
        </div>
      </div>

      {resources.length > 0 && (
        <ResourceOccupancyPanel
          resources={resources}
          schedule={queueSchedule}
          loading={resourcesLoading}
        />
      )}

      {/* Queue Manager */}
      {canRenderQueueManager ? (
        shouldShowScopeLoading ? (
          <Card className="border border-border bg-card">
            <CardContent className="py-16 text-center">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t("clinicQueue.loading.queueInfo")}</p>
            </CardContent>
          </Card>
        ) : (
          <EnhancedQueueManager
            key={`${ownerQueueSelection}:${queueRefreshKey}`}
            clinicId={clinic.id}
            userId={user.id}
            staffId={staffProfile?.id}
            targetQueueStaffId={selectedDoctorQueueStaffId ?? staffProfile?.id}
            canManageMedicalRecords={can("manage_medical_records")}
            useClinicWide={effectiveUseClinicWideQueue}
            allowedStaffIds={effectiveAllowedStaffIds}
            onSummaryChange={setQueueSummary}
            onScheduleChange={setQueueSchedule}
            resources={resources}
            resourcesLoading={resourcesLoading}
            refreshResources={refreshResources}
          />
        )
      ) : clinic?.id && user?.id ? (
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="font-medium text-foreground mb-1">{t("clinicQueue.staffProfile.title")}</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {isClinicOwnerAtClinic
                ? t("clinicQueue.staffProfile.ownerDescription")
                : t("clinicQueue.staffProfile.staffDescription")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("clinicQueue.loading.queue")}</p>
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
          defaultReason={bookingMode === 'walkin' ? t("clinicQueue.booking.walkInReason") : undefined}
          isWalkIn={bookingMode === 'walkin'}
          title={bookingMode === 'walkin' ? t("clinicQueue.booking.walkInTitle") : undefined}
          description={bookingMode === 'walkin' ? t("clinicQueue.booking.walkInDescription") : undefined}
          allowedStaffIds={effectiveAllowedStaffIds}
          performedBy={user?.id}
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
