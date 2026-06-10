// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Deno ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_TOKEN_REGEX = /^ExponentPushToken\[.+\]$/;

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
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";

    if (!to || !title || !messageBody) {
      return jsonResponse({ error: "to, title, and body are required" }, 400);
    }

    if (!EXPO_TOKEN_REGEX.test(to)) {
      return jsonResponse({ error: "Invalid Expo push token format" }, 400);
    }

    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

    const expoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (expoAccessToken) {
      expoHeaders.Authorization = `Bearer ${expoAccessToken}`;
    }

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: expoHeaders,
      body: JSON.stringify({
        to,
        title,
        body: messageBody,
        sound: "default",
        data: {
          notificationId: body?.notification_id ?? null,
          patientId: body?.patient_id ?? null,
        },
      }),
    });

    if (!expoResponse.ok) {
      const rawError = await expoResponse.text();
      return jsonResponse(
        {
          error: "Push provider send failed",
          status: expoResponse.status,
          details: rawError,
        },
        502
      );
    }

    const payload = await expoResponse.json();
    const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;

    if (ticket?.status && ticket.status !== "ok") {
      return jsonResponse(
        {
          error: "Push provider rejected notification",
          details: ticket,
        },
        502
      );
    }

    return jsonResponse({
      success: true,
      ticket,
      to,
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
