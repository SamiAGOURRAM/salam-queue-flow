/**
 * Enhanced Queue Manager - Professional A-Grade UI
 * Industry-leading queue visualization inspired by Stripe, Linear, and modern SaaS
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  UserX, 
  PhoneCall, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Users,
  CheckCircle,
  User,
  RefreshCw,
  Play,
  UserCheck,
  Timer,
  ArrowRight,
  AlertTriangle
} from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, QueueEntry } from "@/services/queue";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface EnhancedQueueManagerProps {
  clinicId: string;
  userId: string;
}

export function EnhancedQueueManager({ clinicId, userId }: EnhancedQueueManagerProps) {
  const today = new Date();
  const [loading, setLoading] = useState(false);

  // Use service layer hook
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

  // Organize queue
  const currentPatient = queue.find(p => p.status === AppointmentStatus.IN_PROGRESS);
  const waitingPatients = queue.filter(p => 
    p.status === AppointmentStatus.WAITING || 
    p.status === AppointmentStatus.SCHEDULED
  );
  const absentPatients = queue.filter(p => 
    p.markedAbsentAt && !p.returnedAt
  );

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

  const handleCallPresent = async (appointmentId: string) => {
    setLoading(true);
    try {
      const absent = absentPatients.find(p => p.id === appointmentId);
      if (absent) {
        await markPatientReturned(appointmentId, userId);
      }
    } catch (error) {
      console.error('Failed to mark returned:', error);
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

  // ============================================
  // UTILITIES
  // ============================================

  const formatWaitTime = (entry: QueueEntry) => {
    if (!entry.checkedInAt) return "Not checked in";
    return formatDistanceToNow(entry.checkedInAt, { addSuffix: true });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case AppointmentStatus.IN_PROGRESS: return "text-green-600 bg-green-50 border-green-200";
      case AppointmentStatus.WAITING: return "text-blue-600 bg-blue-50 border-blue-200";
      case AppointmentStatus.SCHEDULED: return "text-purple-600 bg-purple-50 border-purple-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
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
  // MAIN RENDER - A-GRADE PROFESSIONAL UI
  // ============================================

  return (
    <div className="space-y-6">
      {/* Stats Overview - Modern, Clean, Professional */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-all duration-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Waiting</p>
                <p className="text-3xl font-bold text-blue-600">{summary?.waiting || 0}</p>
                <p className="text-xs text-muted-foreground">patients in queue</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-all duration-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-3xl font-bold text-green-600">{summary?.inProgress || 0}</p>
                <p className="text-xs text-muted-foreground">being served</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <User className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-all duration-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Absent</p>
                <p className="text-3xl font-bold text-orange-600">{absentPatients.length}</p>
                <p className="text-xs text-muted-foreground">not present</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <UserX className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-gray-400 hover:shadow-lg transition-all duration-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold text-gray-600">{summary?.completed || 0}</p>
                <p className="text-xs text-muted-foreground">today</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Patient - Prominent, Clear, Action-Focused */}
      {currentPatient && (
        <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shadow-md">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg text-green-900">Currently Serving</CardTitle>
                  <CardDescription className="text-green-700">
                    Position #{currentPatient.queuePosition}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 px-3 py-1">
                In Progress
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-200 flex items-center justify-center text-xl font-bold text-green-700">
                    {currentPatient.queuePosition}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-green-900">
                      {currentPatient.patient?.fullName || 'Patient'}
                    </h3>
                    <p className="text-sm text-green-700">
                      {currentPatient.patient?.phoneNumber || 'No phone number'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-green-600">
                      <Timer className="h-3 w-3" />
                      <span>Started {formatWaitTime(currentPatient)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={handleCompleteAppointment}
                disabled={loading}
                size="lg"
                className="bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg transition-all duration-200"
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                Complete Visit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waiting Queue - Clean, Scannable, Interactive */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-background to-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Queue</CardTitle>
                <CardDescription>
                  {waitingPatients.length} patient{waitingPatients.length !== 1 ? 's' : ''} waiting
                </CardDescription>
              </div>
            </div>
            
            <Button
              onClick={handleNextPatient}
              disabled={loading || waitingPatients.length === 0 || !!currentPatient}
              size="lg"
              className="shadow-md hover:shadow-lg transition-all duration-200"
            >
              <ChevronRight className="mr-2 h-5 w-5" />
              Call Next Patient
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {waitingPatients.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Users className="h-10 w-10 text-gray-300" />
              </div>
              <p className="text-lg font-medium text-muted-foreground mb-1">No patients waiting</p>
              <p className="text-sm text-muted-foreground">Queue is empty</p>
            </div>
          ) : (
            <div className="space-y-3">
              {waitingPatients.map((patient, index) => (
                <div
                  key={patient.id}
                  className={cn(
                    "group relative flex items-center justify-between p-5 rounded-xl border-2 transition-all duration-200",
                    index === 0 && !currentPatient
                      ? "border-blue-300 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-md hover:shadow-lg"
                      : "border-gray-200 bg-white hover:border-blue-200 hover:shadow-md"
                  )}
                >
                  {/* Position Indicator */}
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold transition-all duration-200",
                        index === 0 && !currentPatient
                          ? "bg-blue-500 text-white shadow-md group-hover:scale-110"
                          : "bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700"
                      )}
                    >
                      {patient.queuePosition}
                    </div>
                    
                    {/* Patient Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-lg truncate">
                          {patient.patient?.fullName || 'Patient'}
                        </h4>
                        {index === 0 && !currentPatient && (
                          <Badge className="bg-blue-500 text-white">Next</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{patient.patient?.phoneNumber || 'No phone'}</span>
                        {patient.isPresent && (
                          <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                            <UserCheck className="mr-1 h-3 w-3" />
                            Checked In
                          </Badge>
                        )}
                        {patient.skipCount > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Skipped {patient.skipCount}×
                          </Badge>
                        )}
                      </div>
                      {patient.checkedInAt && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Waiting {formatWaitTime(patient)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      onClick={() => handleCallPresent(patient.id)}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-600 hover:bg-blue-50"
                    >
                      <PhoneCall className="mr-2 h-4 w-4" />
                      Call
                    </Button>
                    
                    <Button
                      onClick={() => handleMarkAbsent(patient.id)}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-600 hover:bg-orange-50"
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      Absent
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Absent Patients - Collapsible, Non-Intrusive */}
      {absentPatients.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                <UserX className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle className="text-lg text-orange-900">Absent Patients</CardTitle>
                <CardDescription className="text-orange-700">
                  {absentPatients.length} patient{absentPatients.length !== 1 ? 's' : ''} marked absent
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {absentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-orange-200 bg-white hover:border-orange-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-200 text-lg font-bold text-orange-700">
                      {patient.queuePosition}
                    </div>
                    
                    <div>
                      <h4 className="font-semibold">
                        {patient.patient?.fullName || 'Patient'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {patient.patient?.phoneNumber || 'No phone'}
                      </p>
                      {patient.markedAbsentAt && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Absent since {formatWaitTime(patient)}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => markPatientReturned(patient.id, userId)}
                    disabled={loading}
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Return to Queue
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
