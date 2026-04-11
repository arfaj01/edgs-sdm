import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });

    // User context client for auth
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    // Service role client for workflow execution (bypasses RLS for state machine)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    if (!body.submittal_id || !body.trigger_name) {
      return new Response(JSON.stringify({ error: "submittal_id and trigger_name are required" }), { status: 400, headers: corsHeaders });
    }

    // Execute workflow transition via service role (function validates role internally)
    const { data, error } = await serviceClient.rpc("execute_workflow_transition", {
      p_submittal_id: body.submittal_id,
      p_trigger_name: body.trigger_name,
      p_user_id: user.id,
      p_action_code: body.action_code || null,
      p_comments: body.comments || null,
    });

    if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    if (!data?.success) return new Response(JSON.stringify(data), { status: 422, headers: corsHeaders });

    return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
