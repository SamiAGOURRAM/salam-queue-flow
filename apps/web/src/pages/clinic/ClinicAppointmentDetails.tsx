import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Clock, FileText, Phone, Mail, RefreshCw, ShieldAlert, ShieldCheck, Stethoscope, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RequestMedicalHistoryDialog } from "@/components/clinic/RequestMedicalHistoryDialog";
import { SharedRecordsPanel } from "@/components/clinic/SharedRecordsPanel";
import { useMedicalRecordAccess } from "@/hooks/useMedicalRecordAccess";
import { useToast } from "@/hooks/use-toast";
import { queueService, AppointmentStatus, type QueueEntry } from "@/services/queue";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";

type AppointmentMeta = {
  reasonForVisit?: string;
  notes?: string;
};

type PatientContact = {
  phoneNumber?: string;
  email?: string;
};

function formatAppointmentType(type?: string): string {
  if (!type) return "Appointment";
  return type
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function formatAppointmentTime(scheduledTime?: string): string {
  if (!scheduledTime) return "No fixed time";

  const [hourPart, minutePart] = scheduledTime.split(":");
  const hour = Number.parseInt(hourPart, 10);
  if (Number.isNaN(hour)) return scheduledTime;

  const ampm = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  const minutes = (minutePart || "00").padStart(2, "0");

  return `${normalizedHour}:${minutes} ${ampm}`;
}

function formatStatus(status?: AppointmentStatus): string {
  switch (status) {
    case AppointmentStatus.SCHEDULED:
      return "Scheduled";
    case AppointmentStatus.WAITING:
      return "Waiting";
    case AppointmentStatus.IN_PROGRESS:
      return "In progress";
    case AppointmentStatus.COMPLETED:
      return "Completed";
    case AppointmentStatus.CANCELLED:
      return "Cancelled";
    case AppointmentStatus.NO_SHOW:
      return "No-show";
    case AppointmentStatus.RESCHEDULED:
      return "Rescheduled";
    default:
      return "Scheduled";
  }
}

function getStatusBadgeClass(status?: AppointmentStatus): string {
  switch (status) {
    case AppointmentStatus.IN_PROGRESS:
      return "bg-emerald-50 border-emerald-300 text-emerald-700";
    case AppointmentStatus.WAITING:
      return "bg-amber-50 border-amber-300 text-amber-700";
    case AppointmentStatus.COMPLETED:
      return "bg-slate-50 border-slate-300 text-slate-700";
    case AppointmentStatus.CANCELLED:
    case AppointmentStatus.NO_SHOW:
      return "bg-red-50 border-red-300 text-red-700";
    default:
      return "bg-blue-50 border-blue-300 text-blue-700";
  }
}

async function fetchAppointmentMeta(appointmentId: string): Promise<AppointmentMeta> {
  const { data, error } = await supabase
    .from("appointments")
    .select("reason_for_visit, notes")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    reasonForVisit: data?.reason_for_visit ?? undefined,
    notes: data?.notes ?? undefined,
  };
}

async function fetchDoctorName(staffId?: string): Promise<string | undefined> {
  if (!staffId) return undefined;

  const { data: staffRow, error: staffError } = await supabase
    .from("clinic_staff")
    .select("user_id")
    .eq("id", staffId)
    .maybeSingle();

  if (staffError || !staffRow?.user_id) {
    return undefined;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", staffRow.user_id)
    .maybeSingle();

  if (profileError) {
    return undefined;
  }

  return profile?.full_name ?? undefined;
}

async function fetchPatientContact(patientId?: string): Promise<PatientContact> {
  if (!patientId) return {};

  const { data: patientRecord, error: patientError } = await supabase
    .from("patients")
    .select("user_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patientError && patientRecord?.user_id) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("phone_number, email")
      .eq("id", patientRecord.user_id)
      .maybeSingle();

    if (!profileError && profile) {
      return {
        phoneNumber: profile.phone_number ?? undefined,
        email: profile.email ?? undefined,
      };
    }
  }

  const { data: decrypted, error: decryptError } = await supabase.rpc("get_patient_decrypted", {
    p_patient_id: patientId,
  });

  if (decryptError || !Array.isArray(decrypted) || decrypted.length === 0) {
    return {};
  }

  const first = decrypted[0];
  return {
    phoneNumber: typeof first.phone_number === "string" ? first.phone_number : undefined,
    email: typeof first.email === "string" ? first.email : undefined,
  };
}

export default function ClinicAppointmentDetails() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [appointment, setAppointment] = useState<QueueEntry | null>(null);
  const [appointmentMeta, setAppointmentMeta] = useState<AppointmentMeta>({});
  const [doctorName, setDoctorName] = useState<string | undefined>(undefined);
  const [patientContact, setPatientContact] = useState<PatientContact>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);

  const {
    hasAccess,
    activeGrantId,
    expiresAt,
    loading: medicalAccessLoading,
    refreshActiveGrant,
  } = useMedicalRecordAccess(appointment?.patientId);

  const appointmentDateLabel = useMemo(() => {
    if (!appointment?.appointmentDate) return "-";
    return format(appointment.appointmentDate, "EEEE, MMMM d, yyyy");
  }, [appointment?.appointmentDate]);

  const loadDetails = useCallback(async () => {
    if (!appointmentId) {
      setLoadError("Appointment not found.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const entry = await queueService.getQueueEntry(appointmentId);
      const [metaResult, doctorResult, contactResult] = await Promise.allSettled([
        fetchAppointmentMeta(appointmentId),
        fetchDoctorName(entry.staffId),
        fetchPatientContact(entry.patientId),
      ]);

      setAppointment(entry);

      if (metaResult.status === "fulfilled") {
        setAppointmentMeta(metaResult.value);
      } else {
        setAppointmentMeta({});
      }

      if (doctorResult.status === "fulfilled") {
        setDoctorName(doctorResult.value);
      } else {
        setDoctorName(undefined);
      }

      if (contactResult.status === "fulfilled") {
        setPatientContact(contactResult.value);
      } else {
        setPatientContact({});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load appointment details";
      logger.error("Failed to load appointment details", error as Error, { appointmentId });
      setLoadError(message);
      toast({
        title: "Unable to load appointment",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [appointmentId, toast]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleAccessActivated = () => {
    setRecordsPanelOpen(true);
    void refreshActiveGrant();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        </div>
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading appointment details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!appointment || loadError) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Card className="border border-border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium text-foreground">Could not load this appointment</p>
            <p className="text-xs text-muted-foreground mt-1">{loadError ?? "The appointment may not exist or you may not have access."}</p>
            <Button className="mt-4" variant="outline" size="sm" onClick={() => void loadDetails()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Badge variant="outline" className={getStatusBadgeClass(appointment.status)}>
          {formatStatus(appointment.status)}
        </Badge>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Appointment details</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review patient context before the consultation.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Appointment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="text-foreground">{appointmentDateLabel}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Time</span>
              <span className="text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                {formatAppointmentTime(appointment.scheduledTime)}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="text-foreground">{formatAppointmentType(appointment.appointmentType)}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Doctor</span>
              <span className="text-foreground">{doctorName || "Assigned provider"}</span>
            </div>
            <Separator />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Reason / Description</p>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
                {appointmentMeta.reasonForVisit || appointmentMeta.notes || "No reason or description provided."}
              </p>
            </div>
            {appointmentMeta.reasonForVisit && appointmentMeta.notes && appointmentMeta.notes !== appointmentMeta.reasonForVisit && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Additional notes</p>
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{appointmentMeta.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserRound className="w-4 h-4" />
              Patient
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground">{appointment.patient?.fullName || "Unknown patient"}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span className="text-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                {patientContact.phoneNumber || "Not available"}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {patientContact.email || "Not available"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Medical history access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {medicalAccessLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Checking access status...
            </div>
          ) : hasAccess && activeGrantId ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <ShieldCheck className="w-4 h-4" />
                  Medical history unlocked
                </div>
                <p className="text-xs text-emerald-700/90 mt-1">
                  {expiresAt ? `Access valid until ${format(expiresAt, "PPP p")}` : "Access is currently active."}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setRecordsPanelOpen((open) => !open)}>
                <FileText className="w-4 h-4 mr-1.5" />
                {recordsPanelOpen ? "Hide shared records" : "Open shared records"}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                <ShieldAlert className="w-4 h-4" />
                No access to medical history
              </div>
              <p className="text-xs text-amber-700/90 mt-1">
                Request access to review prior records before consultation.
              </p>
              <Button
                type="button"
                className="mt-3"
                variant="outline"
                onClick={() => setRequestDialogOpen(true)}
                disabled={!appointment.patientId}
              >
                Request access
              </Button>
            </div>
          )}

          {recordsPanelOpen && hasAccess && activeGrantId && (
            <SharedRecordsPanel
              grantId={activeGrantId}
              patientName={appointment.patient?.fullName}
              expiresAt={expiresAt}
              onClose={() => setRecordsPanelOpen(false)}
              onExpired={() => {
                setRecordsPanelOpen(false);
                void refreshActiveGrant();
              }}
            />
          )}
        </CardContent>
      </Card>

      <RequestMedicalHistoryDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        clinicId={appointment.clinicId}
        patientId={appointment.patientId}
        appointmentId={appointment.id}
        patientName={appointment.patient?.fullName}
        onAccessActivated={handleAccessActivated}
      />
    </div>
  );
}
