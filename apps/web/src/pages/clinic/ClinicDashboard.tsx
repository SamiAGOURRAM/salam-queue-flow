import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Users, 
  Clock, 
  TrendingUp, 
  Calendar,
  UserPlus, 
  ArrowRight,
  CheckCircle2,
  Timer,
  Settings,
  Sparkles
} from "lucide-react";
import { AppointmentStatus, SkipReason } from "@/services/queue";

interface Clinic {
  id: string;
  name: string;
  practice_type: string;
  specialty: string;
  city: string;
}

interface StaffProfile {
  id: string;
  user_id: string;
}

export default function ClinicDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);

  // Fetch Clinic and Staff Profile
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;

      const clinicData = await clinicService.getClinicByOwner(user.id);
      
      if (clinicData) {
        setClinic({
          id: clinicData.id,
          name: clinicData.name,
          practice_type: clinicData.practiceType,
          specialty: clinicData.specialty,
          city: clinicData.city,
        });

        const staffData = await staffService.getStaffByClinicAndUser(clinicData.id, user.id);
        
        if (staffData) {
          setStaffProfile({
            id: staffData.id,
            user_id: staffData.userId,
          });
        }
      }
    };

    fetchInitialData();
  }, [user]);

  // Use the queue service - REAL DATA
  const {
    schedule,
    isLoading: queueLoading,
  } = useQueueService({
    staffId: staffProfile?.id,
    autoRefresh: true,
  });

  // Calculate summaries - ONLY REAL DATA
  const summary = useMemo(() => {
    if (!schedule) return { 
      waiting: 0, 
      inProgress: 0, 
      completed: 0, 
      averageWaitTime: 0,
    };

    const waiting = schedule.filter(p => 
      (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) && 
      p.skipReason !== SkipReason.PATIENT_ABSENT
    ).length;
    const inProgress = schedule.filter(p => p.status === AppointmentStatus.IN_PROGRESS).length;
    const completed = schedule.filter(p => p.status === AppointmentStatus.COMPLETED).length;

    const completedWithTimes = schedule.filter(e => 
      e.status === AppointmentStatus.COMPLETED && e.checkedInAt && e.startTime
    );
    const totalWaitMinutes = completedWithTimes.reduce((sum, entry) => {
      const waitTime = (new Date(entry.checkedInAt!).getTime() - new Date(entry.startTime!).getTime()) / (1000 * 60);
      return sum + waitTime;
    }, 0);
    const averageWaitTime = completedWithTimes.length > 0 ? Math.round(totalWaitMinutes / completedWithTimes.length) : 0;

    return { 
      waiting, 
      inProgress, 
      completed, 
      averageWaitTime,
    };
  }, [schedule]);

  const activeQueue = useMemo(() => 
    schedule?.filter(p => 
      (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED || p.status === AppointmentStatus.IN_PROGRESS) &&
      p.skipReason !== SkipReason.PATIENT_ABSENT
    ) || [], [schedule]);

  const formatWaitTime = (minutes: number) => {
    if (!minutes || minutes === 0) return "-";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-6 w-full">
      {/* Statistics Cards Row - ONLY REAL DATA */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Today's Queue Card */}
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg hover:border-primary/30 transition-all duration-200 hover:-translate-y-0.5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-foreground-secondary">Today's Queue</CardTitle>
            <div className="p-3 rounded-xl bg-primary-50 border border-primary/20">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground-primary mb-1">
              {summary.waiting}
            </div>
            <p className="text-sm text-foreground-muted mt-1">Patients waiting</p>
          </CardContent>
        </Card>

        {/* In Progress Card */}
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg hover:border-teal/30 transition-all duration-200 hover:-translate-y-0.5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-foreground-secondary">In Progress</CardTitle>
            <div className="p-3 rounded-xl bg-teal-50 border border-teal/20">
              <Activity className="w-5 h-5 text-teal-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground-primary mb-1">
              {summary.inProgress}
            </div>
            <p className="text-sm text-foreground-muted mt-1">Active consultations</p>
          </CardContent>
        </Card>

        {/* Completed Card */}
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg hover:border-success/30 transition-all duration-200 hover:-translate-y-0.5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-foreground-secondary">Completed Today</CardTitle>
            <div className="p-3 rounded-xl bg-success-50 border border-success/20">
              <CheckCircle2 className="w-5 h-5 text-success-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground-primary mb-1">
              {summary.completed}
            </div>
            <p className="text-sm text-foreground-muted mt-1">Appointments done</p>
          </CardContent>
        </Card>

        {/* Average Wait Time Card */}
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg hover:border-coral/30 transition-all duration-200 hover:-translate-y-0.5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-foreground-secondary">Avg Wait Time</CardTitle>
            <div className="p-3 rounded-xl bg-coral-50 border border-coral/20">
              <Clock className="w-5 h-5 text-coral-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground-primary mb-1">
              {formatWaitTime(summary.averageWaitTime)}
            </div>
            <p className="text-sm text-foreground-muted mt-1">Average duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Live Queue Status */}
        <Card className="lg:col-span-2 border-2 border-border/80 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="border-b-2 border-border/80">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground-primary flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-success animate-pulse"></div>
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-success/50 animate-ping"></div>
                  </div>
                  Live Queue Status
                </CardTitle>
                <CardDescription className="text-sm text-foreground-secondary mt-1">Real-time patient flow</CardDescription>
              </div>
              <Button 
                onClick={() => navigate("/clinic/queue")}
                className="bg-primary hover:bg-primary-600"
              >
                View Full Queue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {queueLoading ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <Users className="w-12 h-12 text-primary-600" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground-primary">Loading queue...</h3>
                <p className="text-foreground-secondary">Please wait while we fetch the data</p>
              </div>
            ) : activeQueue.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-6">
                  <Users className="w-12 h-12 text-primary-600" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground-primary">No patients in queue</h3>
                <p className="text-foreground-secondary mb-6">Your queue is currently empty</p>
                <Button 
                  onClick={() => navigate("/clinic/queue")}
                  className="bg-primary hover:bg-primary-600"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Walk-in Patient
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6 pb-3 border-b border-border/50">
                  <div className="text-sm font-semibold text-foreground-secondary">
                    Showing first {Math.min(activeQueue.length, 5)} of {activeQueue.length} patients
                  </div>
                </div>
                 {activeQueue.slice(0, 5).map((patient, index) => (
                   <div
                     key={patient.id}
                     className="flex items-center gap-4 p-4 rounded-xl border-2 border-border/60 hover:border-primary/40 hover:bg-primary-50/30 hover:shadow-sm transition-all duration-200"
                   >
                    <div className={`relative h-14 w-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${
                      index === 0 
                        ? 'bg-coral text-white shadow-md' 
                        : 'bg-background-tertiary text-foreground-secondary'
                    }`}>
                      {patient.queuePosition || (patient.startTime && new Date(patient.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) || 'N/A'}
                      {index === 0 && (
                        <div className="absolute -top-1 -right-1">
                          <Sparkles className="w-5 h-5 text-warning animate-pulse" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base text-foreground-primary truncate">{patient.patient?.fullName || 'Patient'}</p>
                      <p className="text-sm text-foreground-secondary truncate">{patient.appointmentType}</p>
                    </div>
                    <div className="text-right">
                      <Badge 
                        className={`px-4 py-1.5 text-sm font-semibold ${
                          patient.status === AppointmentStatus.IN_PROGRESS
                            ? 'bg-success text-white border-0 shadow-sm'
                            : 'bg-coral-50 text-coral-700 border-coral-200'
                        }`}
                      >
                        {patient.status === AppointmentStatus.IN_PROGRESS ? (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3 animate-pulse" />
                            In Progress
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Waiting
                          </span>
                        )}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="border-b-2 border-border/80">
            <CardTitle className="text-lg font-semibold text-foreground-primary">Quick Actions</CardTitle>
            <CardDescription className="text-sm text-foreground-secondary">Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <Button
              onClick={() => navigate("/clinic/settings")}
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 border-border/80 hover:border-primary/40 hover:bg-primary-50/30 hover:shadow-sm transition-all duration-200 group rounded-xl"
            >
              <div className="flex items-center gap-4 w-full">
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <Settings className="w-6 h-6 text-primary-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-base text-foreground-primary">Clinic Settings</div>
                  <div className="text-sm text-foreground-secondary">Configure hours & types</div>
                </div>
                <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </Button>

            <Button
              onClick={() => navigate("/clinic/team")}
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 border-border/80 hover:border-teal/40 hover:bg-teal-50/30 hover:shadow-sm transition-all duration-200 group rounded-xl"
            >
              <div className="flex items-center gap-4 w-full">
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <UserPlus className="w-6 h-6 text-teal-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-base text-foreground-primary">Invite Staff</div>
                  <div className="text-sm text-foreground-secondary">Add team members</div>
                </div>
                <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-teal group-hover:translate-x-1 transition-all" />
              </div>
            </Button>

            <Button
              onClick={() => navigate("/clinic/calendar")}
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 border-border/80 hover:border-accent/40 hover:bg-accent-50/30 hover:shadow-sm transition-all duration-200 group rounded-xl"
            >
              <div className="flex items-center gap-4 w-full">
                <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <Calendar className="w-6 h-6 text-accent-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-bold text-base text-foreground-primary">Book Appointment</div>
                  <div className="text-sm text-foreground-secondary">Schedule a patient</div>
                </div>
                <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-accent group-hover:translate-x-1 transition-all" />
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
