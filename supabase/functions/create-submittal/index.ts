// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: create-submittal
//
// Creates a new submittal record via the create_submittal SQL helper
// (which handles versioning, submittal_number, and status=draft init).
//
// Phase 2 role model: the allowed global roles that may create a submittal
// from the UI are submitter, consultant, technical_unit, quality_unit,
// project_manager, department_director, admin and owner. The pilot lets
// approval-side roles create submittals on behalf of submitters during
// data migration — workflow triggers remain the authoritative guard.
//
// Returns 201 with the full submittal row on success.
// Returns 400/401/403/500 with a structured { error } body on failure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const ALLOWED_CREATOR_ROLES = new Set([
  "submitter",
  "consultant",
  "technical_unit",
  "quality_unit",
  "project_manager",
  "department_director",
  "project_coordinator",
  "admin",
  "owner",
]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(
        { error: "Edge function misconfigured: missing environment variables" },
        500,
      );
    }

    // ── Auth check (user context) ───────────────────────────
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Payload parsing & validation ────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const deliverable_id: string | undefined = body?.deliverable_id;
    const purpose: string | undefined = body?.purpose;
    const notes: string | null = body?.notes ?? null;

    if (!deliverable_id || !purpose) {
      return json(
        { error: "deliverable_id and purpose are required" },
        400,
      );
    }

    // ── Service role client (RLS bypass for versioning & role lookup) ──
    const serviceClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // ── Role check: global users.role must be in allowlist ──
    const { data: profile, error: profileError } = await serviceClient
      .from("users")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return json(
        { error: `Failed to load user profile: ${profileError.message}` },
        500,
      );
    }

    if (!profile) {
      return json({ error: "User profile not found" }, 403);
    }

    if (!ALLOWED_CREATOR_ROLES.has(profile.role)) {
      return json(
        {
          error:
            `Role '${profile.role}' is not permitted to create submittals`,
        },
        403,
      );
    }

    // ── Create the submittal via SQL helper ────────────────
    const { data: submittalId, error: createError } = await serviceClient.rpc(
      "create_submittal",
      {
        p_deliverable_id: deliverable_id,
        p_submitted_by: user.id,
        p_purpose: purpose,
        p_notes: notes,
      },
    );

    if (createError) {
      return json(
        { error: `create_submittal RPC failed: ${createError.message}` },
        500,
      );
    }

    if (!submittalId) {
      return json({ error: "create_submittal returned null id" }, 500);
    }

    // ── Fetch the full row for the client ──────────────────
    const { data: submittal, error: fetchError } = await serviceClient
      .from("submittals")
      .select("*")
      .eq("id", submittalId)
      .single();

    if (fetchError || !submittal) {
      return json(
        {
          error: `Submittal created but fetch failed: ${
            fetchError?.message ?? "unknown"
          }`,
        },
        500,
      );
    }

    // ── Best-effort audit log (non-fatal) ───────────────────
    try {
      await serviceClient.from("audit_logs").insert({
        entity_type: "submittal",
        entity_id: submittalId,
        action: "create",
        performed_by: user.id,
        new_value: {
          submittal_number: submittal.submittal_number,
          version: submittal.version,
          purpose: submittal.purpose,
        },
      });
    } catch (_auditErr) {
      // Ignore audit failures
    }

    return json(submittal, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Unhandled: ${message}` }, 500);
  }
});
