/**
 * Enhanced Queue Manager - Professional A-Grade UI
 * Modern, intuitive queue visualization with service layer integration
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp
} from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, QueueEntry } from "@/services/queue";
import { formatDistanceToNow, format } from "date-fns";
import { Separator } from "@/components/ui/separator";

interface EnhancedQueueManagerProps {
  clinicId: string;
  userId: string;
}

export function EnhancedQueueManager({ clinicId, userId }: EnhancedQueueManagerProps) {
  const today = new Date();
  const [loading, setLoading] = useState(false);

  // Use our new service layer hook
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
    autoRefresh: true, // Auto-refresh on events
  });

  // Separate queue into categories
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
    if (waitingPatients.length === 0) {
      return; // Toast handled by hook
    }

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
      // First check if patient is in absent list, if so mark them as returned
      const patient = queue.find(p => p.id === appointmentId);
      if (patient?.markedAbsentAt && !patient.returnedAt) {
        await markPatientReturned(appointmentId, userId);
      }
      
      // Then call them
      await callNextPatient(userId);
    } catch (error) {
      console.error('Failed to call present patient:', error);
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
      console.error('Failed to complete appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getStatusBadge = (status: AppointmentStatus) => {
    const statusConfig = {
      [AppointmentStatus.SCHEDULED]: { label: 'مجدول', variant: 'secondary' as const },
      [AppointmentStatus.WAITING]: { label: 'منتظر', variant: 'default' as const },
      [AppointmentStatus.IN_PROGRESS]: { label: 'جاري', variant: 'default' as const },
      [AppointmentStatus.COMPLETED]: { label: 'مكتمل', variant: 'outline' as const },
      [AppointmentStatus.CANCELLED]: { label: 'ملغى', variant: 'destructive' as const },
      [AppointmentStatus.NO_SHOW]: { label: 'لم يحضر', variant: 'destructive' as const },
      [AppointmentStatus.RESCHEDULED]: { label: 'معاد جدولته', variant: 'secondary' as const },
    };

    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatWaitTime = (entry: QueueEntry) => {
    if (!entry.checkedInAt) return '-';
    
    return formatDistanceToNow(entry.checkedInAt, { 
      addSuffix: true, 
      locale: ar 
    });
  };

  // ============================================
  // LOADING & ERROR STATES
  // ============================================

  if (isLoading && queue.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        <p className="mr-3 text-gray-600">جاري تحميل قائمة الانتظار...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center text-red-700">
            <AlertCircle className="ml-2 h-5 w-5" />
            خطأ في تحميل البيانات
          </CardTitle>
          <CardDescription className="text-red-600">
            {error.message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refreshQueue} variant="outline">
            <RefreshCw className="ml-2 h-4 w-4" />
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="space-y-6" dir="rtl">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              في قائمة الانتظار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500 ml-3" />
              <span className="text-3xl font-bold">{summary?.waiting || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              جاري الفحص
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <User className="h-8 w-8 text-green-500 ml-3" />
              <span className="text-3xl font-bold">{summary?.inProgress || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              غائبون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <UserX className="h-8 w-8 text-orange-500 ml-3" />
              <span className="text-3xl font-bold">{absentPatients.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              مكتمل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-gray-400 ml-3" />
              <span className="text-3xl font-bold">{summary?.completed || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Patient */}
      {currentPatient && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <User className="ml-2 h-5 w-5" />
              المريض الحالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 space-x-reverse">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-200 text-lg font-bold text-green-700">
                  {currentPatient.queuePosition}
                </div>
                <div>
                  <p className="font-semibold text-lg">
                    {currentPatient.patient?.fullName || 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {currentPatient.patient?.phoneNumber || 'No phone'}
                  </p>
                  <p className="text-xs text-gray-500">
                    بدأ: {formatWaitTime(currentPatient)}
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={handleCompleteAppointment}
                disabled={loading}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="ml-2 h-5 w-5" />
                إنهاء الفحص
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waiting Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Users className="ml-2 h-5 w-5" />
              قائمة الانتظار ({waitingPatients.length})
            </CardTitle>
            
            <Button
              onClick={handleNextPatient}
              disabled={loading || waitingPatients.length === 0}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ChevronRight className="ml-2 h-5 w-5" />
              المريض التالي
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {waitingPatients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>لا يوجد مرضى في قائمة الانتظار</p>
            </div>
          ) : (
            <div className="space-y-3">
              {waitingPatients.map((patient, index) => (
                <div
                  key={patient.id}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                    index === 0
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center space-x-4 space-x-reverse flex-1">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                        index === 0
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {patient.queuePosition}
                    </div>
                    
                    <div className="flex-1">
                      <p className="font-semibold">
                        {patient.patient?.fullName || 'Unknown'}
                      </p>
                      <div className="flex items-center space-x-3 space-x-reverse text-sm text-gray-600">
                        <span>{patient.patient?.phoneNumber || 'No phone'}</span>
                        {patient.isPresent && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            ✓ حاضر
                          </Badge>
                        )}
                        {patient.skipCount > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            تم التخطي {patient.skipCount}×
                          </Badge>
                        )}
                      </div>
                      {patient.checkedInAt && (
                        <p className="text-xs text-gray-500">
                          <Clock className="inline h-3 w-3 ml-1" />
                          وقت الانتظار: {formatWaitTime(patient)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2 space-x-reverse">
                    <Button
                      onClick={() => handleCallPresent(patient.id)}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                      className="border-blue-500 text-blue-600 hover:bg-blue-50"
                    >
                      <PhoneCall className="ml-2 h-4 w-4" />
                      استدعاء
                    </Button>
                    
                    <Button
                      onClick={() => handleMarkAbsent(patient.id)}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                      className="border-orange-500 text-orange-600 hover:bg-orange-50"
                    >
                      <UserX className="ml-2 h-4 w-4" />
                      غائب
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Absent Patients */}
      {absentPatients.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-700">
              <UserX className="ml-2 h-5 w-5" />
              المرضى الغائبون ({absentPatients.length})
            </CardTitle>
            <CardDescription>
              سيتم إعادتهم إلى نهاية القائمة عند العودة
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {absentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-orange-200 bg-orange-50"
                >
                  <div className="flex items-center space-x-4 space-x-reverse flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-200 text-lg font-bold text-orange-700">
                      {patient.queuePosition}
                    </div>
                    
                    <div>
                      <p className="font-semibold">
                        {patient.patient?.fullName || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {patient.patient?.phoneNumber || 'No phone'}
                      </p>
                      {patient.markedAbsentAt && (
                        <p className="text-xs text-orange-600">
                          <AlertCircle className="inline h-3 w-3 ml-1" />
                          غائب منذ: {formatWaitTime(patient)}
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
                    <CheckCircle className="ml-2 h-4 w-4" />
                    عاد
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
