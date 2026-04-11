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

    // Authenticated user client — RLS ensures they can only see their project data
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) return new Response(JSON.stringify({ error: "project_id required" }), { status: 400, headers: corsHeaders });

    // KPI functions use SECURITY DEFINER so they work with anon key
    // but we use service role here for aggregation across all project data
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user is member of this project
    const { data: member } = await serviceClient
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!member) return new Response(JSON.stringify({ error: "Not a member of this project" }), { status: 403, headers: corsHeaders });

    const [kpis, progress, delayed, performance, distribution] = await Promise.all([
      serviceClient.rpc("get_project_kpis", { p_project_id: projectId }),
      serviceClient.rpc("get_phase_progress", { p_project_id: projectId }),
      serviceClient.rpc("get_delayed_deliverables", { p_project_id: projectId }),
      serviceClient.rpc("get_consultant_performance", { p_project_id: projectId }),
      serviceClient.rpc("get_action_code_distribution", { p_project_id: projectId }),
    ]);

    return new Response(JSON.stringify({
      summary: kpis.data,
      phase_progress: progress.data,
      delayed_deliverables: delayed.data,
      consultant_performance: performance.data,
      action_code_distribution: distribution.data,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
