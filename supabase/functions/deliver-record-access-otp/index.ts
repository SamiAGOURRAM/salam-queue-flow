// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClaimDeliveryResult {
  otp_id: string;
  otp_plaintext: string;
  delivery_channel: "sms" | "email";
  recipient_contact: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const body = await req.json();
    const grantId = typeof body?.grant_id === "string" ? body.grant_id : "";
    if (!grantId) {
      return new Response(JSON.stringify({ error: "grant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claim, error: claimError } = await service.rpc("claim_medical_record_otp_for_delivery", {
      p_grant_id: grantId,
      p_requester_user_id: authData.user.id,
    });

    if (claimError || !claim) {
      return new Response(JSON.stringify({ error: "OTP claim failed or unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claimPayload = claim as ClaimDeliveryResult;
    if (!claimPayload.otp_id || !claimPayload.otp_plaintext || !claimPayload.delivery_channel || !claimPayload.recipient_contact) {
      return new Response(JSON.stringify({ error: "Invalid OTP delivery payload" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let deliveryOk = false;
    let deliveryError: string | null = null;

    try {
      if (claimPayload.delivery_channel === "sms") {
        const smsResponse = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: claimPayload.recipient_contact,
            message:
              `QueueMed: رمز الوصول لسجلاتك الطبية هو ${claimPayload.otp_plaintext}. ` +
              "صالح لمدة 5 دقائق. لا تشاركه مع أحد غير طبيبك.",
            notification_id: claimPayload.otp_id,
          }),
        });

        if (!smsResponse.ok) {
          throw new Error(`SMS delivery failed with status ${smsResponse.status}`);
        }
      } else {
        throw new Error("Email delivery is not implemented yet");
      }

      deliveryOk = true;
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Delivery failed";
    }

    await service.rpc("finalize_medical_record_otp_delivery", {
      p_otp_id: claimPayload.otp_id,
      p_success: deliveryOk,
      p_error: deliveryError,
    });

    if (!deliveryOk) {
      return new Response(JSON.stringify({ error: deliveryError || "Delivery failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, delivery_channel: claimPayload.delivery_channel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
