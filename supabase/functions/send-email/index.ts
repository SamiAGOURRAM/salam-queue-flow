// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Deno ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!to || !subject || !message) {
      return jsonResponse({ error: "to, subject, and message are required" }, 400);
    }

    if (!EMAIL_REGEX.test(to)) {
      return jsonResponse({ error: "Invalid email address format" }, 400);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL");

    if (!resendApiKey || !resendFromEmail) {
      return jsonResponse({ error: "Email provider environment variables are not configured" }, 500);
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [to],
        subject,
        text: message,
      }),
    });

    if (!resendResponse.ok) {
      const rawError = await resendResponse.text();
      return jsonResponse(
        {
          error: "Email provider send failed",
          status: resendResponse.status,
          details: rawError,
        },
        502
      );
    }

    const payload = await resendResponse.json();

    return jsonResponse({
      success: true,
      id: payload?.id ?? null,
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
