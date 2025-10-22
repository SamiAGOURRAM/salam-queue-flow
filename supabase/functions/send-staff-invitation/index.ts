import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { clinicId, email, fullName } = await req.json();

    console.log("Invitation request received:", {
      clinicId,
      email,
      fullName,
      userId: user.id,
    });

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

    console.log("Clinic verified:", clinic.name);

    // Generate unique invitation token
    const invitationToken = crypto.randomUUID();

    // Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from("staff_invitations")
      .insert({
        clinic_id: clinicId,
        invited_by: user.id,
        email: email,
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

    // Send Email using Brevo (free 300 emails/day)
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("SENDER_EMAIL") || "noreply@yourdomain.com";
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:8080";

    console.log("Email configuration check:", {
      hasBrevoKey: !!brevoApiKey,
      senderEmail,
      appUrl,
    });

    if (!brevoApiKey) {
      console.error("Missing Brevo API key");
      throw new Error("Email service not configured - BREVO_API_KEY missing. Sign up at https://brevo.com for free 300 emails/day");
    }

    const invitationUrl = `${appUrl}/accept-invitation/${invitationToken}`;
    console.log("Generated invitation URL:", invitationUrl);

    const emailHtml = `<html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .info-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏥 QueueMed</h1>
            <p>Smart Queue Management</p>
          </div>
          <div class="content">
            <h2>You're Invited!</h2>
            <p>Hello <strong>${fullName}</strong>,</p>
            <p>You've been invited to join <strong>${clinic.name}</strong> as a receptionist on QueueMed.</p>
            
            <div class="info-box">
              <p><strong>Clinic:</strong> ${clinic.name}</p>
              <p><strong>Role:</strong> Receptionist</p>
            </div>

            <p>Click the button below to accept your invitation and complete your registration:</p>
            
            <div style="text-align: center;">
              <a href="${invitationUrl}" class="button">Accept Invitation</a>
            </div>

            <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${invitationUrl}</p>

            <p style="margin-top: 20px; font-size: 14px; color: #ef4444;">⚠️ This invitation will expire in 7 days.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} QueueMed. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>`;

    try {
      console.log("Sending email via Brevo API...");
      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: "QueueMed",
            email: senderEmail,
          },
          to: [
            {
              email: email,
              name: fullName,
            },
          ],
          subject: `Invitation to join ${clinic.name} on QueueMed`,
          htmlContent: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.text();
        console.error("Brevo API error:", errorData);
        throw new Error(`Brevo API error: ${emailResponse.status} - ${errorData}`);
      }

      const emailData = await emailResponse.json();
      console.log("Email sent successfully via Brevo:", emailData);

      return new Response(
        JSON.stringify({
          success: true,
          invitation,
          messageId: emailData.messageId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (emailError: any) {
      console.error("Email sending error details:", {
        message: emailError?.message,
        name: emailError?.name,
      });
      throw new Error(`Failed to send invitation email: ${emailError?.message || "Unknown error"}`);
    }
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
