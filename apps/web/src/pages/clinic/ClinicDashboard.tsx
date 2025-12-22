import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Activity,
  Users,
  Clock,
  Calendar,
  UserPlus,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Settings,
  MoreHorizontal
} from "lucide-react";
import { AppointmentStatus, SkipReason } from "@/services/queue";
import { cn } from "@/lib/utils";

// ===== ALL INTERFACES PRESERVED =====
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

type ChartFilter = "7d" | "30d" | "90d" | "1y";

export default function ClinicDashboard() {
  // ===== ALL HOOKS PRESERVED IN EXACT ORDER =====
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [chartFilter, setChartFilter] = useState<ChartFilter>("7d");

  // ===== ALL EFFECTS PRESERVED =====
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

  // ===== QUEUE SERVICE PRESERVED =====
  const {
    schedule,
    isLoading: queueLoading,
  } = useQueueService({
    staffId: staffProfile?.id,
    autoRefresh: true,
  });

  // ===== ALL CALCULATIONS PRESERVED =====
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

  // ===== ALL HELPER FUNCTIONS PRESERVED =====
  const formatWaitTime = (minutes: number) => {
    if (!minutes || minutes === 0) return "-";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Chart data based on filter
  const chartData = useMemo(() => {
    const getDays = () => {
      switch (chartFilter) {
        case "7d": return 7;
        case "30d": return 30;
        case "90d": return 90;
        case "1y": return 365;
      }
    };

    const days = getDays();
    const data = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const daySchedule = schedule?.filter(apt => {
        const aptDate = new Date(apt.startTime || apt.createdAt);
        return aptDate.toDateString() === date.toDateString();
      }) || [];

      const completed = daySchedule.filter(a => a.status === AppointmentStatus.COMPLETED).length;
      const missed = daySchedule.filter(a => a.skipReason === SkipReason.PATIENT_ABSENT).length;

      data.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        completed,
        missed,
      });
    }

    if (chartFilter === "90d" || chartFilter === "1y") {
      const aggregated = [];
      const groupSize = chartFilter === "90d" ? 7 : 30;
      for (let i = 0; i < data.length; i += groupSize) {
        const group = data.slice(i, i + groupSize);
        aggregated.push({
          date: group[0].date,
          completed: group.reduce((sum, d) => sum + d.completed, 0),
          missed: group.reduce((sum, d) => sum + d.missed, 0),
        });
      }
      return aggregated;
    }

    return data;
  }, [schedule, chartFilter]);

  const chartConfig = {
    completed: {
      label: "Completed",
      color: "hsl(var(--teal))",
    },
    missed: {
      label: "Missed",
      color: "hsl(var(--coral))",
    },
  };

  return (
    <div className="space-y-5">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Queue */}
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Queue</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-foreground">{summary.waiting}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Patients currently waiting</p>
          </CardContent>
        </Card>

        {/* Active */}
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-teal" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Active</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-foreground">{summary.inProgress}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">In consultation now</p>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Completed</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-foreground">{summary.completed}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Appointments done today</p>
          </CardContent>
        </Card>

        {/* Avg Wait */}
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-coral/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-coral" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Avg Wait</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-foreground">{formatWaitTime(summary.averageWaitTime)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average patient wait time</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Quick Actions Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Appointments Chart */}
        <Card className="lg:col-span-2 border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Appointment Overview</CardTitle>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal" />
                    <span className="text-xs text-muted-foreground">Completed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-coral" />
                    <span className="text-xs text-muted-foreground">Missed</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
                {(["7d", "30d", "90d", "1y"] as ChartFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setChartFilter(filter)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                      chartFilter === filter
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {filter === "7d" ? "7D" : filter === "30d" ? "30D" : filter === "90d" ? "3M" : "1Y"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--teal))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--teal))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="missedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--coral))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--coral))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickMargin={10}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickMargin={10}
                  width={35}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="hsl(var(--teal))"
                  strokeWidth={2}
                  fill="url(#completedGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                />
                <Area
                  type="monotone"
                  dataKey="missed"
                  stroke="hsl(var(--coral))"
                  strokeWidth={2}
                  fill="url(#missedGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => navigate("/clinic/queue")}
              className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-border/60 bg-card hover:bg-muted/30 hover:border-primary/40 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Manage Queue</p>
                <p className="text-xs text-muted-foreground">Handle patient flow</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>

            <button
              onClick={() => navigate("/clinic/calendar")}
              className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-border/60 bg-card hover:bg-muted/30 hover:border-teal/40 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-teal" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Calendar</p>
                <p className="text-xs text-muted-foreground">View schedule</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-teal transition-colors" />
            </button>

            <button
              onClick={() => navigate("/clinic/team")}
              className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-border/60 bg-card hover:bg-muted/30 hover:border-accent/40 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Team</p>
                <p className="text-xs text-muted-foreground">Manage staff</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>

            <button
              onClick={() => navigate("/clinic/settings")}
              className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-border/60 bg-card hover:bg-muted/30 hover:border-muted-foreground/40 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Settings</p>
                <p className="text-xs text-muted-foreground">Configure clinic</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Live Queue - Full Width */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
              </span>
              <CardTitle className="text-base font-semibold">Live Queue</CardTitle>
              {activeQueue.length > 0 && (
                <Badge variant="secondary" className="text-xs font-medium">
                  {activeQueue.length} patient{activeQueue.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/clinic/queue")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {queueLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Loading queue...</span>
              </div>
            </div>
          ) : activeQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-base font-medium text-foreground">No patients in queue</p>
              <p className="text-sm text-muted-foreground mt-1">Your queue is currently empty</p>
              <Button
                onClick={() => navigate("/clinic/queue")}
                className="mt-5"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Patient
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">#</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">Patient</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">Type</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">Time</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {activeQueue.slice(0, 6).map((patient, index) => (
                    <tr key={patient.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold",
                          index === 0 ? "bg-coral text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {patient.queuePosition || (index + 1)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              {patient.patient?.fullName?.[0] || 'P'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{patient.patient?.fullName || 'Patient'}</p>
                            <p className="text-xs text-muted-foreground">{patient.patient?.phoneNumber || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-foreground">{patient.appointmentType || 'Consultation'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {patient.startTime
                            ? new Date(patient.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs font-medium",
                            patient.status === AppointmentStatus.IN_PROGRESS
                              ? "bg-success/10 text-success hover:bg-success/10"
                              : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10"
                          )}
                        >
                          {patient.status === AppointmentStatus.IN_PROGRESS ? (
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              In Progress
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Waiting
                            </span>
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {activeQueue.length > 6 && (
                <div className="py-3 px-4 border-t border-border/30 bg-muted/20">
                  <button
                    onClick={() => navigate("/clinic/queue")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    +{activeQueue.length - 6} more patients in queue
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
