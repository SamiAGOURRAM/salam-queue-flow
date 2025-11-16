/**
 * Supabase Edge Function: Predict Wait Time
 * 
 * THIN API PROXY - NO PROCESSING HERE
 * 
 * Frontend sends: { appointmentId: string }
 * 
 * This function:
 * 1. Receives appointment ID
 * 2. Calls external ML service API
 * 3. Returns prediction
 * 
 * ALL processing (feature engineering, ML) happens in external ML service
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PredictionRequest {
  appointmentId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestData: PredictionRequest = await req.json();

    // Get ML service URL from environment
    const mlServiceUrl = Deno.env.get("ML_SERVICE_URL");
    if (!mlServiceUrl) {
      throw new Error("ML_SERVICE_URL not configured");
    }

    // Forward request to external ML service
    // ML service does ALL processing (feature engineering, prediction)
    const response = await fetch(`${mlServiceUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appointmentId: requestData.appointmentId,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML service error: ${response.statusText}`);
    }

    const prediction = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        prediction,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

