import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  UserX, 
  PhoneCall, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Users,
  CheckCircle,
  User
} from "lucide-react";

interface QueuePatient {
  id: string;
  patient_id: string;
  patient_name: string;
  phone_number: string;
  queue_position: number | null;
  status: string;
  predicted_start_time: string | null;
  is_present: boolean;
  marked_absent_at: string | null;
  appointment_type: string;
  actual_start_time: string | null;
  skip_count: number;
}

interface AbsentPatient extends QueuePatient {
  grace_period_ends_at?: string;
  new_position?: number;
}

export function EnhancedQueueManager({ clinicId, userId }: { clinicId: string; userId: string }) {
  const [activeQueue, setActiveQueue] = useState<QueuePatient[]>([]);
  const [absentPatients, setAbsentPatients] = useState<AbsentPatient[]>([]);
  const [currentPatient, setCurrentPatient] = useState<QueuePatient | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadQueue();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`queue:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`
        },
        () => {
          console.log('Queue updated - reloading');
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [clinicId]);

  const loadQueue = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Load active queue
      const { data: active, error: activeError } = await supabase
        .from('appointments')
        .select(`
          id,
          patient_id,
          queue_position,
          status,
          predicted_start_time,
          is_present,
          marked_absent_at,
          appointment_type,
          actual_start_time,
          skip_count,
          profiles:patient_id(full_name, phone_number)
        `)
        .eq('clinic_id', clinicId)
        .eq('appointment_date', today)
        .in('status', ['scheduled', 'waiting', 'in_progress'])
        .order('queue_position', { ascending: true, nullsFirst: false });

      if (activeError) {
        console.error('Error loading active queue:', activeError);
      }

      // Load absent patients with grace period info
      const { data: absent, error: absentError } = await supabase
        .from('absent_patients')
        .select(`
          id,
          appointment_id,
          marked_absent_at,
          returned_at,
          new_position,
          grace_period_ends_at,
          appointments!inner(
            id,
            patient_id,
            queue_position,
            status,
            appointment_type,
            skip_count,
            profiles:patient_id(full_name, phone_number)
          )
        `)
        .eq('clinic_id', clinicId)
        .is('returned_at', null)
        .gte('grace_period_ends_at', new Date().toISOString());

      if (absentError) {
        console.error('Error loading absent patients:', absentError);
      }

      if (active) {
        const formattedActive = active
          .filter((a: any) => a.profiles)
          .map((a: any) => ({
            id: a.id,
            patient_id: a.patient_id,
            patient_name: a.profiles?.full_name || 'Unknown',
            phone_number: a.profiles?.phone_number || '',
            queue_position: a.queue_position,
            status: a.status,
            predicted_start_time: a.predicted_start_time,
            is_present: a.is_present || false,
            marked_absent_at: a.marked_absent_at,
            appointment_type: a.appointment_type,
            actual_start_time: a.actual_start_time,
            skip_count: a.skip_count || 0
          }));

        setActiveQueue(formattedActive.filter(p => p.status !== 'in_progress'));
        setCurrentPatient(formattedActive.find(p => p.status === 'in_progress') || null);
      }

      if (absent) {
        const formattedAbsent = absent
          .filter((a: any) => a.appointments?.profiles)
          .map((a: any) => ({
            id: a.appointments.id,
            patient_id: a.appointments.patient_id,
            patient_name: a.appointments.profiles?.full_name || 'Unknown',
            phone_number: a.appointments.profiles?.phone_number || '',
            queue_position: a.appointments.queue_position,
            status: a.appointments.status,
            predicted_start_time: null,
            is_present: false,
            marked_absent_at: a.marked_absent_at,
            appointment_type: a.appointments.appointment_type,
            actual_start_time: null,
            skip_count: a.appointments.skip_count || 0,
            grace_period_ends_at: a.grace_period_ends_at,
            new_position: a.new_position
          }));

        setAbsentPatients(formattedAbsent);
      }
    } catch (error) {
      console.error('Error in loadQueue:', error);
    }
  };

  const handleNextPatient = async () => {
    if (activeQueue.length === 0) {
      toast({
        title: "قائمة الانتظار فارغة",
        description: "لا يوجد مرضى في قائمة الانتظار",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
        body: {
          clinic_id: clinicId,
          action: 'next',
          performed_by: userId
        }
      });

      if (error) throw error;

      toast({
        title: "✅ نجح",
        description: data.message || 'تم استدعاء المريض التالي',
      });
      
      loadQueue();
    } catch (error: any) {
      console.error('Next patient error:', error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في معالجة المريض التالي",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAbsent = async (appointmentId: string, patientName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
        body: {
          clinic_id: clinicId,
          action: 'mark_absent',
          appointment_id: appointmentId,
          performed_by: userId
        }
      });

      if (error) throw error;

      toast({
        title: "تم وضع علامة غائب",
        description: `${patientName} - تم إرسال إشعار SMS`,
      });
      
      loadQueue();
    } catch (error: any) {
      console.error('Mark absent error:', error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في وضع علامة الغياب",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCallPresent = async (appointmentId: string, patientName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
        body: {
          clinic_id: clinicId,
          action: 'call_present',
          appointment_id: appointmentId,
          reason: 'Patient present in waiting room',
          performed_by: userId
        }
      });

      if (error) throw error;

      toast({
        title: "تم استدعاء المريض",
        description: `${patientName} - تم إشعار المرضى المتخطين`,
      });
      
      loadQueue();
    } catch (error: any) {
      console.error('Call present error:', error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في استدعاء المريض",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLateArrival = async (appointmentId: string, patientName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
        body: {
          clinic_id: clinicId,
          action: 'late_arrival',
          appointment_id: appointmentId,
          performed_by: userId
        }
      });

      if (error) throw error;

      toast({
        title: "تمت إعادة الإدراج في القائمة",
        description: `${patientName} - ${data.message}`,
      });
      
      loadQueue();
    } catch (error: any) {
      console.error('Late arrival error:', error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في إعادة الإدراج",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('ar-MA', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getGraceTimeRemaining = (graceEndsAt?: string) => {
    if (!graceEndsAt) return 0;
    const remaining = Math.max(0, (new Date(graceEndsAt).getTime() - Date.now()) / 60000);
    return Math.ceil(remaining);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Current Patient Card */}
      <Card className="lg:col-span-3 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                المريض الحالي في الاستشارة
              </h3>
              {currentPatient ? (
                <div className="mt-2">
                  <p className="text-2xl font-bold flex items-center gap-2">
                    <User className="h-6 w-6 text-primary" />
                    {currentPatient.patient_name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    بدأ في {formatTime(currentPatient.actual_start_time)}
                  </p>
                </div>
              ) : (
                <p className="text-xl font-medium text-muted-foreground mt-2">
                  لا يوجد مريض في الاستشارة
                </p>
              )}
            </div>
            
            <Button
              size="lg"
              onClick={handleNextPatient}
              disabled={loading || activeQueue.length === 0}
              className="bg-primary hover:bg-primary/90 text-lg px-8 py-6"
            >
              <ChevronRight className="mr-2 h-6 w-6" />
              التالي - Next
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Queue */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">قائمة الانتظار النشطة</h2>
          <Badge variant="outline" className="text-base">
            <Users className="mr-1 h-4 w-4" />
            {activeQueue.length} في الانتظار
          </Badge>
        </div>

        {activeQueue.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">قائمة الانتظار فارغة</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeQueue.map((patient, index) => (
              <Card key={patient.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                        {patient.queue_position || '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-lg">{patient.patient_name}</p>
                          {patient.skip_count > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              تم التخطي {patient.skip_count}x
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>{patient.appointment_type}</span>
                          {patient.predicted_start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(patient.predicted_start_time)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {index === 0 ? (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          التالي
                        </Badge>
                      ) : patient.is_present ? (
                        <Badge variant="secondary">حاضر</Badge>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCallPresent(patient.id, patient.patient_name)}
                            disabled={loading}
                            title="استدعاء هذا المريض (تجاوز الدور)"
                            className="gap-1"
                          >
                            <PhoneCall className="h-4 w-4" />
                            <span className="hidden sm:inline">استدعاء</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAbsent(patient.id, patient.patient_name)}
                            disabled={loading}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 gap-1"
                            title="وضع علامة غائب"
                          >
                            <UserX className="h-4 w-4" />
                            <span className="hidden sm:inline">غائب</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Absent Patients List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">المرضى الغائبون</h2>
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            <AlertCircle className="mr-1 h-3 w-3" />
            {absentPatients.length} غائب
          </Badge>
        </div>

        {absentPatients.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50 text-green-500" />
            <p>لا يوجد مرضى غائبون</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {absentPatients.map((patient) => {
              const graceMinutes = getGraceTimeRemaining(patient.grace_period_ends_at);
              
              return (
                <Card key={patient.id} className="border-orange-200 bg-orange-50/50">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{patient.patient_name}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {patient.phone_number}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="mr-1 h-3 w-3" />
                          {formatTime(patient.marked_absent_at)}
                        </Badge>
                      </div>
                      
                      {graceMinutes > 0 && (
                        <div className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                          فترة سماح: {graceMinutes} دقيقة متبقية
                        </div>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLateArrival(patient.id, patient.patient_name)}
                        disabled={loading}
                        className="w-full bg-white hover:bg-orange-50"
                      >
                        وصل متأخراً - إضافة للقائمة
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
