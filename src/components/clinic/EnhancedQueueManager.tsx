/**
 * Enhanced Queue Manager - Clean & Elegant
 * Focused on essential features and smooth workflow
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  UserX, 
  PhoneCall, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Users,
  CheckCircle,
  RefreshCw,
  Play,
  UserCheck,
  AlertTriangle,
  RotateCcw
} from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, QueueEntry, SkipReason } from "@/services/queue";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface EnhancedQueueManagerProps {
  clinicId: string;
  userId: string;
}

export function EnhancedQueueManager({ clinicId, userId }: EnhancedQueueManagerProps) {
  const [today] = useState(() => new Date());
  const [loading, setLoading] = useState(false);

  const {
    queue,
    summary,
    isLoading,
    error,
    refreshQueue,
    callNextPatient,
    markPatientAbsent,
    markPatientReturned,
    completeAppointment,
  } = useQueueService({
    clinicId,
    date: today,
    autoRefresh: true,
  });

  // Organize queue - EXACTLY like QueueService.getQueueSummary()
  const currentPatient = queue.find(p => p.status === AppointmentStatus.IN_PROGRESS);
  
  const waitingPatients = queue.filter(p => 
    (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) &&
    p.skipReason !== SkipReason.PATIENT_ABSENT
  );
  
  // Use EXACT same logic as summary: absent = skipReason === PATIENT_ABSENT && !returnedAt
  const absentPatients = queue.filter(p => 
    p.skipReason === SkipReason.PATIENT_ABSENT && !p.returnedAt
  );

  const displayedQueueCount = waitingPatients.length;

  // Debug log
  console.log('Queue data:', {
    total: queue.length,
    waiting: waitingPatients.length,
    absent: absentPatients.length,
    summaryAbsent: summary?.absent,
    allPatients: queue.map(p => ({
      id: p.id,
      name: p.patient?.fullName,
      status: p.status,
      skipReason: p.skipReason,
      markedAbsentAt: p.markedAbsentAt,
      returnedAt: p.returnedAt
    }))
  });

  // ============================================
  // HANDLERS
  // ============================================

  const handleNextPatient = async () => {
    if (waitingPatients.length === 0) return;
    setLoading(true);
    try {
      await callNextPatient(userId);
    } catch (error) {
      console.error('Failed to call next patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAbsent = async (appointmentId: string) => {
    setLoading(true);
    try {
      await markPatientAbsent({
        appointmentId,
        performedBy: userId,
        gracePeriodMinutes: 15,
        reason: 'Patient not present when called',
      });
    } catch (error) {
      console.error('Failed to mark patient absent:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAppointment = async () => {
    if (!currentPatient) return;
    setLoading(true);
    try {
      await completeAppointment(currentPatient.id, userId);
    } catch (error) {
      console.error('Failed to complete:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToQueue = async (appointmentId: string) => {
    setLoading(true);
    try {
      await markPatientReturned(appointmentId, userId);
    } catch (error) {
      console.error('Failed to return patient to queue:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // UTILITIES
  // ============================================

  const formatWaitTime = (entry: QueueEntry) => {
    if (!entry.checkedInAt) return "Not checked in";
    return formatDistanceToNow(entry.checkedInAt, { addSuffix: true });
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPositionDisplay = (position?: number | null) => {
    if (!position && position !== 0) return "—";
    return position.toString().padStart(3, '0');
  };

  // ============================================
  // LOADING & ERROR STATES
  // ============================================

  if (isLoading && queue.length === 0) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="text-center space-y-4">
          <RefreshCw className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive gap-2">
            <AlertCircle className="h-5 w-5" />
            Error Loading Queue
          </CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refreshQueue} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Waiting</p>
                  <p className="text-3xl font-bold text-orange-600">{summary?.waiting || 0}</p>
                </div>
                <Users className="h-10 w-10 text-orange-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">In Progress</p>
                  <p className="text-3xl font-bold text-green-600">{summary?.inProgress || 0}</p>
                </div>
                <Play className="h-10 w-10 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Absent</p>
                  <p className="text-3xl font-bold text-red-600">{summary?.absent || 0}</p>
                </div>
                <UserX className="h-10 w-10 text-red-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Completed</p>
                  <p className="text-3xl font-bold text-slate-600">{summary?.completed || 0}</p>
                </div>
                <CheckCircle className="h-10 w-10 text-slate-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left - Current Patient & Queue */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Patient */}
            {currentPatient ? (
              <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-green-900">Currently Serving</CardTitle>
                    <Badge className="bg-green-600 text-white">
                      <Play className="h-3 w-3 mr-1" />
                      In Progress
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="h-16 w-16 border-4 border-white shadow-lg">
                      <AvatarFallback className="bg-gradient-to-br from-green-400 to-emerald-500 text-white text-xl font-bold">
                        {getInitials(currentPatient.patient?.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-green-900">
                        {currentPatient.patient?.fullName || 'Patient'}
                      </h3>
                      <p className="text-green-700">
                        Position #{getPositionDisplay(currentPatient.queuePosition)}
                      </p>
                      <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatWaitTime(currentPatient)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm text-green-900 mb-4">
                    <div>
                      <p className="text-green-700 text-xs">Phone</p>
                      <p className="font-mono">{currentPatient.patient?.phoneNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-green-700 text-xs">Email</p>
                      <p className="truncate">{currentPatient.patient?.email || 'N/A'}</p>
                    </div>
                  </div>

                  <Button 
                    onClick={handleCompleteAppointment}
                    disabled={loading}
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Complete Appointment
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-600 font-medium">No patient being served</p>
                  <p className="text-sm text-slate-500 mt-1">Call next patient to start</p>
                </CardContent>
              </Card>
            )}

            {/* Waiting Queue */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Waiting Queue</CardTitle>
                    <CardDescription>
                      {displayedQueueCount} patient{displayedQueueCount !== 1 ? 's' : ''} waiting
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleNextPatient}
                    disabled={loading || waitingPatients.length === 0 || !!currentPatient}
                    size="lg"
                  >
                    <ChevronRight className="mr-2 h-5 w-5" />
                    Call Next
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {waitingPatients.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-500">No patients waiting</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {waitingPatients.map((patient, index) => (
                      <div
                        key={patient.id}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                          index === 0 && !currentPatient
                            ? "border-orange-300 bg-orange-50"
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center font-bold shadow-sm",
                          index === 0 && !currentPatient
                            ? "bg-orange-500 text-white"
                            : "bg-slate-100 text-slate-700"
                        )}>
                          {getPositionDisplay(patient.queuePosition)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold truncate">
                              {patient.patient?.fullName || 'Patient'}
                            </p>
                            {index === 0 && !currentPatient && (
                              <Badge className="bg-orange-500 text-white text-xs">Next</Badge>
                            )}
                            {patient.isPresent && (
                              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                <UserCheck className="mr-1 h-3 w-3" />
                                Checked In
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">
                            {patient.patient?.phoneNumber || 'No phone'}
                          </p>
                          {patient.checkedInAt && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              Waiting {formatWaitTime(patient)}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleMarkAbsent(patient.id)}
                            disabled={loading}
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <UserX className="mr-1 h-4 w-4" />
                            Absent
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right - Absent Patients (Always visible) */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card className={cn(
              "border-2 transition-all",
              absentPatients.length > 0 ? "border-red-300 shadow-md" : "border-slate-200"
            )}>
              <CardHeader className={cn(
                "pb-4",
                absentPatients.length > 0 ? "bg-red-50/50" : "bg-slate-50/50"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      absentPatients.length > 0 ? "bg-red-100" : "bg-slate-100"
                    )}>
                      <UserX className={cn(
                        "h-5 w-5",
                        absentPatients.length > 0 ? "text-red-600" : "text-slate-400"
                      )} />
                    </div>
                    <div>
                      <CardTitle className={cn(
                        "text-base",
                        absentPatients.length > 0 ? "text-red-900" : "text-slate-600"
                      )}>
                        Absent Patients
                      </CardTitle>
                      <CardDescription className={cn(
                        "text-xs",
                        absentPatients.length > 0 ? "text-red-700" : "text-slate-500"
                      )}>
                        {absentPatients.length > 0 
                          ? `${absentPatients.length} patient${absentPatients.length !== 1 ? 's' : ''}`
                          : 'No absences'
                        }
                      </CardDescription>
                    </div>
                  </div>
                  {absentPatients.length > 0 && (
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                      {absentPatients.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto">
                {absentPatients.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                      <UserCheck className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-500 font-medium">All patients present</p>
                    <p className="text-xs text-slate-400 mt-1">No absences recorded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {absentPatients.map((patient) => (
                      <div
                        key={patient.id}
                        className="group relative p-4 rounded-lg border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50 hover:shadow-md transition-all"
                      >
                        {/* Position Badge */}
                        <div className="absolute -top-2 -left-2">
                          <div className="h-8 w-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {getPositionDisplay(patient.queuePosition)}
                          </div>
                        </div>

                        {/* Patient Info */}
                        <div className="space-y-3 pt-2">
                          <div>
                            <p className="font-bold text-red-900 truncate pr-6">
                              {patient.patient?.fullName || 'Patient'}
                            </p>
                            <p className="text-xs text-red-700 mt-1">
                              {patient.patient?.phoneNumber || 'No phone'}
                            </p>
                          </div>

                          {/* Absence Info */}
                          <div className="flex items-center gap-2 text-xs text-red-600 bg-white/60 rounded px-2 py-1.5">
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {patient.markedAbsentAt ? (
                                <>Absent {formatDistanceToNow(patient.markedAbsentAt, { addSuffix: true })}</>
                              ) : (
                                'Recently marked absent'
                              )}
                            </span>
                          </div>

                          {/* Return Button */}
                          <Button
                            onClick={() => handleReturnToQueue(patient.id)}
                            disabled={loading}
                            size="sm"
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Return to Queue
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Helper Text */}
            {absentPatients.length > 0 && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-800 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Patients will be added to the end of the queue when returned</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
