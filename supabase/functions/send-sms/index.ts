import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendSMSRequest {
  notification_id?: string;
  phone_number: string;
  message: string;
  clinic_id: string;
  patient_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { notification_id, phone_number, message, clinic_id }: SendSMSRequest = await req.json();

    // Check if Twilio is configured
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioToken || !twilioPhone) {
      console.log('Twilio not configured - SMS simulation mode');
      
      if (notification_id) {
        await supabase
          .from('notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            rendered_message: message
          })
          .eq('id', notification_id);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          simulated: true,
          message: 'SMS simulated (Twilio not configured)',
          phone: phone_number,
          text: message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send SMS via Twilio
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone_number,
          From: twilioPhone,
          Body: message,
        }),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`Twilio error: ${responseData.message || response.statusText}`);
    }

    // Calculate cost (approximate - Twilio pricing varies by country)
    const estimatedCost = 0.05; // $0.05 per SMS for Morocco (approximate)

    // Update notification record
    if (notification_id) {
      await supabase
        .from('notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          rendered_message: message,
          cost_estimate: estimatedCost
        })
        .eq('id', notification_id);
    }

    // Update clinic budget
    const { data: budget } = await supabase
      .from('clinic_notification_budgets')
      .select('current_month_spend')
      .eq('clinic_id', clinic_id)
      .single();

    if (budget) {
      const newSpend = (parseFloat(budget.current_month_spend) || 0) + estimatedCost;
      
      await supabase
        .from('clinic_notification_budgets')
        .update({
          current_month_spend: newSpend
        })
        .eq('clinic_id', clinic_id);

      // Check if approaching budget limit
      const { data: updatedBudget } = await supabase
        .from('clinic_notification_budgets')
        .select('monthly_budget_amount, alert_threshold')
        .eq('clinic_id', clinic_id)
        .single();

      if (updatedBudget) {
        const threshold = parseFloat(updatedBudget.monthly_budget_amount) * parseFloat(updatedBudget.alert_threshold);
        if (newSpend >= threshold) {
          console.log(`⚠️ Clinic ${clinic_id} approaching SMS budget limit`);
          // Could send alert to clinic owner here
        }
      }
    }

    // Log to notification analytics
    await supabase
      .from('notification_analytics')
      .insert({
        clinic_id,
        notification_id,
        channel: 'sms',
        type: 'position_update', // Default type
        was_delivered: true,
        cost_actual: estimatedCost,
        date: new Date().toISOString().split('T')[0]
      });

    console.log(`✅ SMS sent to ${phone_number}: ${message.substring(0, 50)}...`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_sid: responseData.sid,
        cost: estimatedCost
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SMS send error:', error);

    // Update notification to failed if we have the ID
    const body = await req.json();
    if (body.notification_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase
        .from('notifications')
        .update({
          status: 'failed',
          error_message: error.message,
          retry_count: supabase.raw('retry_count + 1')
        })
        .eq('id', body.notification_id);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
