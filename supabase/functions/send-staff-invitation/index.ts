import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  clinicId: string;
  fullName: string;
  phoneNumber: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the user from the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { clinicId, fullName, phoneNumber }: InvitationRequest = await req.json();

    // Verify user owns the clinic
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, name")
      .eq("id", clinicId)
      .eq("owner_id", user.id)
      .single();

    if (clinicError || !clinic) {
      throw new Error("Clinic not found or unauthorized");
    }

    // Generate unique invitation token
    const invitationToken = crypto.randomUUID();

    // Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from("staff_invitations")
      .insert({
        clinic_id: clinicId,
        invited_by: user.id,
        phone_number: phoneNumber,
        full_name: fullName,
        invitation_token: invitationToken,
        status: "pending",
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      throw new Error("Failed to create invitation");
    }

    // Send SMS via Twilio
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !twilioPhone) {
      console.error("Missing Twilio credentials");
      throw new Error("SMS service not configured");
    }

    const invitationUrl = `${Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovableproject.com")}/accept-invitation/${invitationToken}`;
    
    const message = `You've been invited to join ${clinic.name} as a receptionist on QueueMed. Accept your invitation: ${invitationUrl}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: new URLSearchParams({
        To: phoneNumber,
        From: twilioPhone,
        Body: message,
      }),
    });

    if (!twilioResponse.ok) {
      const error = await twilioResponse.text();
      console.error("Twilio error:", error);
      throw new Error("Failed to send SMS");
    }

    console.log("Invitation sent successfully to", phoneNumber);

    return new Response(
      JSON.stringify({ success: true, invitation }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-staff-invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
