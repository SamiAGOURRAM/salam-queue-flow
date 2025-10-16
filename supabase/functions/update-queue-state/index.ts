import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { clinic_id, current_patient_id, next_patient_id, patient_id, action } = await req.json();

    console.log(`Queue action: ${action}`, { clinic_id, current_patient_id, next_patient_id, patient_id });

    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Handle different actions
    if (action === 'next') {
      // Complete current patient if exists
      if (current_patient_id) {
        await supabaseClient
          .from('appointments')
          .update({
            status: 'completed',
            actual_end_time: now
          })
          .eq('id', current_patient_id);
        
        console.log(`Completed patient: ${current_patient_id}`);
      }

      // Start next patient
      await supabaseClient
        .from('appointments')
        .update({
          status: 'in_progress',
          actual_start_time: now,
          checked_in_at: now
        })
        .eq('id', next_patient_id);

      console.log(`Started patient: ${next_patient_id}`);

      // Recalculate queue positions and ETAs
      await recalculateQueue(supabaseClient, clinic_id, today);

      // Send notifications
      await sendQueueNotifications(supabaseClient, clinic_id, next_patient_id);

    } else if (action === 'mark_absent') {
      // Mark patient as no_show
      await supabaseClient
        .from('appointments')
        .update({
          status: 'no_show'
        })
        .eq('id', patient_id);

      console.log(`Marked absent: ${patient_id}`);

      // Get patient phone for SMS
      const { data: appointment } = await supabaseClient
        .from('appointments')
        .select('patient_id, profiles:patient_id(phone_number, full_name)')
        .eq('id', patient_id)
        .single();

      if (appointment) {
        // Send SMS notification
        await supabaseClient
          .from('notifications')
          .insert({
            patient_id: appointment.patient_id,
            clinic_id: clinic_id,
            channel: 'sms',
            type: 'queue_update',
            recipient: (appointment as any).profiles.phone_number,
            message_template: 'You have missed your turn. Please see the receptionist upon arrival.',
            status: 'pending'
          });
      }

      // Recalculate queue
      await recalculateQueue(supabaseClient, clinic_id, today);

    } else if (action === 'call_present') {
      // Call a present patient (override)
      const { data: calledPatient } = await supabaseClient
        .from('appointments')
        .select('queue_position')
        .eq('id', next_patient_id)
        .single();

      // Get current in-progress patient
      const { data: inProgressPatient } = await supabaseClient
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('appointment_date', today)
        .eq('status', 'in_progress')
        .single();

      // Complete current if exists
      if (inProgressPatient) {
        await supabaseClient
          .from('appointments')
          .update({
            status: 'completed',
            actual_end_time: now
          })
          .eq('id', inProgressPatient.id);
      }

      // Start called patient
      await supabaseClient
        .from('appointments')
        .update({
          status: 'in_progress',
          actual_start_time: now,
          checked_in_at: now
        })
        .eq('id', next_patient_id);

      console.log(`Called patient: ${next_patient_id}`);

      // Notify skipped patients
      if (calledPatient) {
        const { data: skippedPatients } = await supabaseClient
          .from('appointments')
          .select('id, patient_id, profiles:patient_id(phone_number, full_name)')
          .eq('clinic_id', clinic_id)
          .eq('appointment_date', today)
        .in('status', ['scheduled', 'waiting'])
          .lt('queue_position', calledPatient.queue_position);

        if (skippedPatients && skippedPatients.length > 0) {
          for (const patient of skippedPatients) {
            await supabaseClient
              .from('notifications')
              .insert({
                patient_id: patient.patient_id,
                clinic_id: clinic_id,
                channel: 'sms',
                type: 'queue_update',
                recipient: (patient as any).profiles.phone_number,
                message_template: 'A patient was taken ahead. You are still next. Your estimated time has been updated.',
                status: 'pending'
              });
          }
        }
      }

      // Recalculate queue
      await recalculateQueue(supabaseClient, clinic_id, today);
    }

    // Create queue snapshot for analytics
    await createQueueSnapshot(supabaseClient, clinic_id, today);

    return new Response(
      JSON.stringify({ success: true, message: 'Queue updated successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error updating queue:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function recalculateQueue(supabaseClient: any, clinicId: string, date: string) {
  // Get all waiting appointments in order
  const { data: appointments } = await supabaseClient
    .from('appointments')
    .select('id, queue_position, estimated_duration')
    .eq('clinic_id', clinicId)
    .eq('appointment_date', date)
    .in('status', ['scheduled', 'waiting'])
    .order('queue_position', { ascending: true });

  if (!appointments || appointments.length === 0) return;

  // Get current in-progress patient
  const { data: inProgress } = await supabaseClient
    .from('appointments')
    .select('actual_start_time, estimated_duration')
    .eq('clinic_id', clinicId)
    .eq('appointment_date', date)
    .eq('status', 'in_progress')
    .single();

  let currentTime = new Date();
  
  if (inProgress && inProgress.actual_start_time) {
    // Calculate when current patient will be done
    const startTime = new Date(inProgress.actual_start_time);
    const duration = inProgress.estimated_duration || 15;
    currentTime = new Date(startTime.getTime() + duration * 60000);
  }

  // Update predicted times for waiting patients
  for (const appointment of appointments) {
    const duration = appointment.estimated_duration || 15;
    const predictedTime = new Date(currentTime);
    
    await supabaseClient
      .from('appointments')
      .update({
        predicted_start_time: predictedTime.toISOString(),
        predicted_wait_time: Math.round((predictedTime.getTime() - Date.now()) / 60000)
      })
      .eq('id', appointment.id);

    // Add buffer and move to next
    currentTime = new Date(currentTime.getTime() + duration * 60000);
  }

  console.log(`Recalculated queue for ${appointments.length} patients`);
}

async function sendQueueNotifications(supabaseClient: any, clinicId: string, nextPatientId: string) {
  // Get next 3 patients
  const { data: upcomingPatients } = await supabaseClient
    .from('appointments')
    .select('id, patient_id, queue_position, predicted_start_time, profiles:patient_id(phone_number, full_name)')
    .eq('clinic_id', clinicId)
    .in('status', ['scheduled', 'checked_in'])
    .order('queue_position', { ascending: true })
    .limit(3);

  if (!upcomingPatients) return;

  for (const patient of upcomingPatients) {
    const position = patient.queue_position;
    let message = '';

    if (patient.id === nextPatientId) {
      message = `You are next! Please proceed to the consultation room.`;
    } else if (position <= 3) {
      const estimatedTime = patient.predicted_start_time 
        ? new Date(patient.predicted_start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'soon';
      message = `You are #${position} in line. Estimated time: ${estimatedTime}`;
    }

    if (message) {
      await supabaseClient
        .from('notifications')
        .insert({
          patient_id: patient.patient_id,
          clinic_id: clinicId,
          channel: 'sms',
          type: 'queue_update',
          recipient: (patient as any).profiles.phone_number,
          message_template: message,
          status: 'pending'
        });
    }
  }

  console.log(`Sent notifications to ${upcomingPatients.length} patients`);
}

async function createQueueSnapshot(supabaseClient: any, clinicId: string, date: string) {
  const { data: stats } = await supabaseClient
    .from('appointments')
    .select('status')
    .eq('clinic_id', clinicId)
    .eq('appointment_date', date);

  if (!stats) return;

  const waiting = stats.filter((a: any) => a.status === 'scheduled' || a.status === 'waiting').length;
  const inProgress = stats.filter((a: any) => a.status === 'in_progress').length;
  const completed = stats.filter((a: any) => a.status === 'completed').length;

  await supabaseClient
    .from('queue_snapshots')
    .insert({
      clinic_id: clinicId,
      snapshot_date: date,
      snapshot_time: new Date().toISOString(),
      total_waiting: waiting,
      total_in_progress: inProgress,
      total_completed_today: completed
    });

  console.log('Created queue snapshot');
}
