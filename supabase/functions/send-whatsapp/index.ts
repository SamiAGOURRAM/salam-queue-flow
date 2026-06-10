// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Deno ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAuthorizedRequest(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string
): Promise<boolean> {
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return false;
  }

  if (token === serviceRoleKey) {
    return true;
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return false;
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roles, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .in("role", ["super_admin", "clinic_owner", "staff"])
    .limit(1);

  if (roleError) {
    return false;
  }

  return Array.isArray(roles) && roles.length > 0;
}

function toWhatsAppAddress(phoneNumber: string): string {
  const value = phoneNumber.trim();
  if (value.toLowerCase().startsWith("whatsapp:")) {
    return value;
  }
  return `whatsapp:${value}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing auth token" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase environment variables are not configured" }, 500);
    }

    const authorized = await isAuthorizedRequest(authHeader, supabaseUrl, anonKey, serviceRoleKey);
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!to || !message) {
      return jsonResponse({ error: "to and message are required" }, 400);
    }

    const rawPhone = to.toLowerCase().startsWith("whatsapp:") ? to.slice(9) : to;
    if (!E164_REGEX.test(rawPhone)) {
      return jsonResponse({ error: "Invalid phone number format. Use E.164 (e.g. +212612345678)" }, 400);
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFromWhatsApp = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";

    if (!twilioAccountSid || !twilioAuthToken) {
      return jsonResponse(
        {
          error: "Twilio environment variables are not configured",
        },
        500
      );
    }

    const authValue = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const params = new URLSearchParams();
    params.set("To", toWhatsAppAddress(to));
    params.set("From", toWhatsAppAddress(twilioFromWhatsApp));
    params.set("Body", message);

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authValue}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    if (!twilioResponse.ok) {
      const rawError = await twilioResponse.text();
      return jsonResponse(
        {
          error: "Twilio WhatsApp send failed",
          status: twilioResponse.status,
          details: rawError,
        },
        502
      );
    }

    const payload = await twilioResponse.json();

    return jsonResponse({
      success: true,
      messageSid: payload.sid,
      status: payload.status,
      to: payload.to,
      notificationId: body?.notification_id ?? null,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      500
    );
  }
});
