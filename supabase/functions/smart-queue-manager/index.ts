import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueAction {
  clinic_id: string;
  action: 'next' | 'mark_absent' | 'call_present' | 'late_arrival' | 'complete_current';
  patient_id?: string;
  appointment_id?: string;
  reason?: string;
  performed_by: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const action: QueueAction = await req.json();
    
    console.log('Smart Queue Manager - Action:', action.action, 'Clinic:', action.clinic_id);
    
    let result;
    
    switch (action.action) {
      case 'mark_absent':
        result = await handleMarkAbsent(supabase, action);
        break;
      
      case 'call_present':
        result = await handleCallPresent(supabase, action);
        break;
      
      case 'late_arrival':
        result = await handleLateArrival(supabase, action);
        break;
      
      case 'next':
        result = await handleNextPatient(supabase, action);
        break;
      
      case 'complete_current':
        result = await handleCompleteCurrentPatient(supabase, action);
        break;
      
      default:
        throw new Error(`Unknown action: ${action.action}`);
    }

    // Recalculate queue positions and predictions
    await recalculateQueue(supabase, action.clinic_id);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Queue manager error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function handleMarkAbsent(supabase: any, action: QueueAction) {
  const now = new Date().toISOString();
  const appointmentId = action.appointment_id || action.patient_id;
  
  // Get appointment details
  const { data: appointment, error: aptError } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      clinic_id,
      queue_position,
      profiles:patient_id(full_name, phone_number, preferred_language)
    `)
    .eq('id', appointmentId)
    .single();
  
  if (aptError || !appointment) {
    throw new Error('Appointment not found');
  }

  // Get clinic info for grace period
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, settings')
    .eq('id', action.clinic_id)
    .single();
  
  const gracePeriod = clinic?.settings?.absent_grace_period_minutes || 10;
  
  // Update appointment status
  await supabase
    .from('appointments')
    .update({
      status: 'no_show',
      marked_absent_at: now,
      is_present: false,
      original_queue_position: appointment.queue_position
    })
    .eq('id', appointmentId);
  
  // Create absent record
  const { error: absentError } = await supabase
    .from('absent_patients')
    .insert({
      appointment_id: appointmentId,
      clinic_id: action.clinic_id,
      patient_id: appointment.patient_id,
      marked_absent_at: now
    });
  
  if (absentError) {
    console.error('Error creating absent record:', absentError);
  }
  
  // Create audit log
  await supabase
    .from('queue_overrides')
    .insert({
      clinic_id: action.clinic_id,
      appointment_id: appointmentId,
      action_type: 'mark_absent',
      performed_by: action.performed_by,
      reason: action.reason || 'Patient not present when called',
      previous_position: appointment.queue_position,
      new_position: null
    });
  
  // Send notification to patient
  await sendNotification(supabase, {
    patient_id: appointment.patient_id,
    clinic_id: action.clinic_id,
    template_key: 'patient_marked_absent',
    language: appointment.profiles.preferred_language || 'en',
    variables: {
      patient_name: appointment.profiles.full_name,
      clinic_name: clinic?.name || 'the clinic'
    },
    phone_number: appointment.profiles.phone_number,
    priority: 'high'
  });
  
  return { 
    message: 'Patient marked as absent',
    grace_period_minutes: gracePeriod,
    notification_sent: true
  };
}

async function handleCallPresent(supabase: any, action: QueueAction) {
  const appointmentId = action.appointment_id || action.patient_id;
  
  // Get the called patient
  const { data: calledPatient } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      queue_position,
      profiles:patient_id(full_name, phone_number, preferred_language)
    `)
    .eq('id', appointmentId)
    .single();
  
  if (!calledPatient) {
    throw new Error('Patient not found');
  }
  
  // Get all patients in queue before this one
  const { data: currentQueue } = await supabase
    .from('appointments')
    .select(`
      id,
      queue_position,
      patient_id,
      skip_count,
      profiles:patient_id(phone_number, full_name, preferred_language)
    `)
    .eq('clinic_id', action.clinic_id)
    .eq('appointment_date', new Date().toISOString().split('T')[0])
    .in('status', ['scheduled', 'waiting'])
    .order('queue_position');
  
  const skippedPatients = currentQueue.filter(
    p => p.queue_position < calledPatient.queue_position && p.id !== appointmentId
  );
  
  // Update skipped patients' skip count
  for (const skipped of skippedPatients) {
    await supabase
      .from('appointments')
      .update({ 
        skip_count: (skipped.skip_count || 0) + 1,
        skip_reason: 'patient_present'
      })
      .eq('id', skipped.id);
    
    // Send reassurance notification
    await sendNotification(supabase, {
      patient_id: skipped.patient_id,
      clinic_id: action.clinic_id,
      template_key: 'still_next_reassurance',
      language: skipped.profiles.preferred_language || 'en',
      variables: {
        patient_name: skipped.profiles.full_name,
        position: skipped.queue_position
      },
      phone_number: skipped.profiles.phone_number,
      priority: 'medium'
    });
  }
  
  // Update called patient
  await supabase
    .from('appointments')
    .update({
      status: 'in_progress',
      actual_start_time: new Date().toISOString(),
      is_present: true
    })
    .eq('id', appointmentId);
  
  // Create audit log
  await supabase
    .from('queue_overrides')
    .insert({
      clinic_id: action.clinic_id,
      appointment_id: appointmentId,
      skipped_patient_ids: skippedPatients.map(p => p.id),
      action_type: 'call_present',
      performed_by: action.performed_by,
      reason: action.reason || 'Patient present in waiting room',
      previous_position: calledPatient.queue_position
    });
  
  return { 
    message: 'Patient called to consultation',
    skipped_count: skippedPatients.length,
    notifications_sent: skippedPatients.length
  };
}

async function handleLateArrival(supabase: any, action: QueueAction) {
  const appointmentId = action.appointment_id || action.patient_id;
  
  // Get current queue length
  const { data: queueData } = await supabase
    .from('appointments')
    .select('queue_position')
    .eq('clinic_id', action.clinic_id)
    .eq('appointment_date', new Date().toISOString().split('T')[0])
    .in('status', ['scheduled', 'waiting', 'in_progress'])
    .order('queue_position', { ascending: false })
    .limit(1);
  
  const newPosition = (queueData?.[0]?.queue_position || 0) + 1;
  
  // Get appointment and clinic info
  const { data: appointment } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      original_queue_position,
      profiles:patient_id(phone_number, full_name, preferred_language)
    `)
    .eq('id', appointmentId)
    .single();
  
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', action.clinic_id)
    .single();
  
  // Update appointment with new position
  await supabase
    .from('appointments')
    .update({
      status: 'waiting',
      queue_position: newPosition,
      returned_at: new Date().toISOString(),
      is_present: true,
      marked_absent_at: null
    })
    .eq('id', appointmentId);
  
  // Update absent record
  await supabase
    .from('absent_patients')
    .update({
      returned_at: new Date().toISOString(),
      new_position: newPosition
    })
    .eq('appointment_id', appointmentId)
    .is('returned_at', null);
  
  // Create audit log
  await supabase
    .from('queue_overrides')
    .insert({
      clinic_id: action.clinic_id,
      appointment_id: appointmentId,
      action_type: 'late_arrival',
      performed_by: action.performed_by,
      reason: 'Late arrival - re-queued at end',
      previous_position: appointment.original_queue_position,
      new_position: newPosition
    });
  
  // Send confirmation SMS
  await sendNotification(supabase, {
    patient_id: appointment.patient_id,
    clinic_id: action.clinic_id,
    template_key: 'late_arrival_requeued',
    language: appointment.profiles.preferred_language || 'en',
    variables: {
      clinic_name: clinic?.name || 'the clinic',
      position: newPosition
    },
    phone_number: appointment.profiles.phone_number,
    priority: 'high'
  });
  
  return { 
    message: 'Patient re-queued after late arrival',
    new_position: newPosition,
    notification_sent: true
  };
}

async function handleNextPatient(supabase: any, action: QueueAction) {
  const today = new Date().toISOString().split('T')[0];
  
  // Complete current patient if any
  const { data: currentPatient } = await supabase
    .from('appointments')
    .select('id')
    .eq('clinic_id', action.clinic_id)
    .eq('status', 'in_progress')
    .eq('appointment_date', today)
    .single();
  
  if (currentPatient) {
    await supabase
      .from('appointments')
      .update({
        status: 'completed',
        actual_end_time: new Date().toISOString()
      })
      .eq('id', currentPatient.id);
  }
  
  // Get next patient
  const { data: nextPatient } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      queue_position,
      profiles:patient_id(full_name, phone_number, preferred_language)
    `)
    .eq('clinic_id', action.clinic_id)
    .eq('appointment_date', today)
    .in('status', ['scheduled', 'waiting'])
    .order('queue_position')
    .limit(1)
    .single();
  
  if (!nextPatient) {
    return { message: 'No patients in queue' };
  }
  
  // Update next patient to in_progress
  await supabase
    .from('appointments')
    .update({
      status: 'in_progress',
      actual_start_time: new Date().toISOString(),
      is_present: true
    })
    .eq('id', nextPatient.id);
  
  // Get clinic info
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', action.clinic_id)
    .single();
  
  // Send "your turn" notification
  await sendNotification(supabase, {
    patient_id: nextPatient.patient_id,
    clinic_id: action.clinic_id,
    template_key: 'your_turn',
    language: nextPatient.profiles.preferred_language || 'en',
    variables: {
      clinic_name: clinic?.name || 'the clinic'
    },
    phone_number: nextPatient.profiles.phone_number,
    priority: 'high'
  });
  
  return { 
    message: 'Next patient called',
    patient_name: nextPatient.profiles.full_name,
    position: nextPatient.queue_position
  };
}

async function handleCompleteCurrentPatient(supabase: any, action: QueueAction) {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: currentPatient } = await supabase
    .from('appointments')
    .select('id, patient_id')
    .eq('clinic_id', action.clinic_id)
    .eq('status', 'in_progress')
    .eq('appointment_date', today)
    .single();
  
  if (!currentPatient) {
    return { message: 'No patient in progress' };
  }
  
  await supabase
    .from('appointments')
    .update({
      status: 'completed',
      actual_end_time: new Date().toISOString()
    })
    .eq('id', currentPatient.id);
  
  return { message: 'Current patient marked as completed' };
}

async function recalculateQueue(supabase: any, clinicId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get all active appointments
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, queue_position, status, estimated_duration, actual_start_time')
    .eq('clinic_id', clinicId)
    .eq('appointment_date', today)
    .in('status', ['scheduled', 'waiting', 'in_progress'])
    .order('queue_position');
  
  if (!appointments || appointments.length === 0) return;
  
  let currentTime = new Date();
  const inProgress = appointments.find(a => a.status === 'in_progress');
  
  if (inProgress && inProgress.actual_start_time) {
    // Estimate remaining time for current patient
    const elapsedMinutes = (Date.now() - new Date(inProgress.actual_start_time).getTime()) / 60000;
    const remainingMinutes = Math.max(0, (inProgress.estimated_duration || 20) - elapsedMinutes);
    currentTime = new Date(Date.now() + remainingMinutes * 60000);
  }
  
  // Update predictions for waiting patients
  for (const apt of appointments.filter(a => a.status !== 'in_progress')) {
    const duration = apt.estimated_duration || 20;
    
    await supabase
      .from('appointments')
      .update({
        predicted_start_time: currentTime.toISOString(),
        predicted_wait_time: Math.round((currentTime.getTime() - Date.now()) / 60000),
        last_prediction_update: new Date().toISOString()
      })
      .eq('id', apt.id);
    
    currentTime = new Date(currentTime.getTime() + duration * 60000);
  }
}

async function sendNotification(supabase: any, params: {
  patient_id: string;
  clinic_id: string;
  template_key: string;
  language: string;
  variables: Record<string, any>;
  phone_number: string;
  priority: 'high' | 'medium' | 'low';
}) {
  // Get template
  const { data: template } = await supabase
    .from('notification_templates')
    .select('template_text')
    .eq('template_key', params.template_key)
    .eq('language', params.language)
    .eq('is_active', true)
    .or(`clinic_id.is.null,clinic_id.eq.${params.clinic_id}`)
    .order('is_custom', { ascending: false })
    .limit(1)
    .single();
  
  if (!template) {
    console.log(`No template found for ${params.template_key} in ${params.language}`);
    return;
  }
  
  // Replace variables in template
  let message = template.template_text;
  for (const [key, value] of Object.entries(params.variables)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  
  // Check budget before sending
  const { data: budget } = await supabase
    .from('clinic_notification_budgets')
    .select('*')
    .eq('clinic_id', params.clinic_id)
    .single();
  
  if (budget && !budget.notifications_enabled) {
    console.log('Notifications disabled for clinic');
    return;
  }
  
  if (budget && budget.current_month_sms_count >= budget.monthly_sms_limit) {
    console.log('SMS limit reached for clinic');
    return;
  }
  
  // Create notification record
  const { data: notification } = await supabase
    .from('notifications')
    .insert({
      patient_id: params.patient_id,
      clinic_id: params.clinic_id,
      channel: 'sms',
      type: params.template_key,
      status: 'pending',
      message_template: message,
      recipient: params.phone_number,
      priority: params.priority === 'high' ? 1 : params.priority === 'medium' ? 5 : 10
    })
    .select()
    .single();
  
  if (notification) {
    // Trigger SMS sending (will be handled by separate function)
    console.log(`Notification queued: ${params.template_key} to ${params.phone_number}`);
    
    // Update budget counter
    await supabase
      .from('clinic_notification_budgets')
      .update({
        current_month_sms_count: (budget?.current_month_sms_count || 0) + 1
      })
      .eq('clinic_id', params.clinic_id);
  }
}
