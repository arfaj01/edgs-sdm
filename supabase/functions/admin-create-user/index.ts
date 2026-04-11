// admin-create-user
// ============================================================
// Edge Function that creates a Supabase Auth user (with email +
// password) AND a matching public.users profile row in a single
// atomic operation. Caller must be authenticated and must hold
// either the 'admin' or 'department_director' role (legacy 'owner'
// is also accepted for backwards compatibility).
//
// Body:
//   {
//     email:        string,            // will be lowercased
//     password:     string,            // plaintext (Supabase hashes)
//     full_name:    string,
//     full_name_ar: string,
//     role:         "submitter" | "technical_unit" | "quality_unit"
//                 | "project_manager" | "department_director" | "admin",
//     organization?: string,
//     phone?:        string,
//     project_ids?:  string[]          // optional SDM-style memberships
//   }
//
// Response:
//   { success: true, user: { id, email, role, ... } }
//   or { success: false, error: "..." }
//
// All sensitive operations use the SERVICE ROLE key, but the
// caller is verified against the public.users table first to
// ensure they have an admin-level role.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_ROLES = ["admin", "department_director", "owner"];

const CANONICAL_ROLES = [
  "submitter",
  "technical_unit",
  "quality_unit",
  "project_manager",
  "department_director",
  "admin",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing authorization" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Verify caller identity using their JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    // 2. Service-role client for privileged work
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Confirm the caller's role is admin/director
    const { data: callerProfile, error: profileError } = await serviceClient
      .from("users")
      .select("id, role, is_active")
      .eq("id", caller.id)
      .is("deleted_at", null)
      .single();

    if (profileError || !callerProfile) {
      return jsonResponse({ success: false, error: "Caller profile not found" }, 403);
    }
    if (!callerProfile.is_active) {
      return jsonResponse({ success: false, error: "Caller account is inactive" }, 403);
    }
    if (!ADMIN_ROLES.includes(callerProfile.role)) {
      return jsonResponse(
        { success: false, error: "Caller is not an admin or department director" },
        403,
      );
    }

    // 4. Parse + validate body
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const email = (body.email || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();
    const full_name = (body.full_name || "").toString().trim();
    const full_name_ar = (body.full_name_ar || "").toString().trim();
    const role = (body.role || "").toString();
    const organization = (body.organization || "").toString().trim() || null;
    const phone = (body.phone || "").toString().trim() || null;
    const project_ids: string[] = Array.isArray(body.project_ids) ? body.project_ids : [];

    if (!email || !email.includes("@")) {
      return jsonResponse({ success: false, error: "Valid email is required" }, 400);
    }
    if (!password || password.length < 6) {
      return jsonResponse(
        { success: false, error: "Password must be at least 6 characters" },
        400,
      );
    }
    if (!full_name) {
      return jsonResponse({ success: false, error: "full_name is required" }, 400);
    }
    if (!CANONICAL_ROLES.includes(role)) {
      return jsonResponse({ success: false, error: `Role must be one of ${CANONICAL_ROLES.join(", ")}` }, 400);
    }

    // 5. Check whether an auth user already exists with this email
    let authUserId: string | null = null;
    {
      const { data: list, error: listError } = await serviceClient.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listError) {
        return jsonResponse({ success: false, error: `Auth list failed: ${listError.message}` }, 500);
      }
      const existing = list?.users?.find(
        (u: { email?: string | null }) => (u.email || "").toLowerCase() === email,
      );
      if (existing) authUserId = existing.id;
    }

    // 6. Create or update auth user
    if (authUserId) {
      const { error: updErr } = await serviceClient.auth.admin.updateUserById(authUserId, {
        password,
        email,
        email_confirm: true,
        user_metadata: { full_name, full_name_ar, role },
      });
      if (updErr) {
        return jsonResponse(
          { success: false, error: `Auth update failed: ${updErr.message}` },
          500,
        );
      }
    } else {
      const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, full_name_ar, role },
      });
      if (createErr || !created?.user) {
        return jsonResponse(
          { success: false, error: `Auth create failed: ${createErr?.message || "unknown"}` },
          500,
        );
      }
      authUserId = created.user.id;
    }

    if (!authUserId) {
      return jsonResponse({ success: false, error: "Auth user id missing after create/update" }, 500);
    }

    // 7. Upsert public.users profile
    const { data: profile, error: upsertError } = await serviceClient
      .from("users")
      .upsert(
        {
          id: authUserId,
          email,
          full_name,
          full_name_ar: full_name_ar || null,
          role,
          organization,
          phone,
          is_active: true,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    if (upsertError) {
      return jsonResponse(
        { success: false, error: `Profile upsert failed: ${upsertError.message}` },
        500,
      );
    }

    // 8. Optional project memberships
    if (project_ids.length > 0) {
      const rows = project_ids.map((pid) => ({
        project_id: pid,
        user_id: authUserId!,
        role,
      }));
      const { error: pmError } = await serviceClient
        .from("project_members")
        .upsert(rows, { onConflict: "project_id,user_id" });
      if (pmError) {
        return jsonResponse(
          { success: true, user: profile, warning: `Profile saved but membership failed: ${pmError.message}` },
          200,
        );
      }
    }

    return jsonResponse({ success: true, user: profile });
  } catch (err) {
    return jsonResponse(
      { success: false, error: (err as Error).message || "Unknown server error" },
      500,
    );
  }
});
