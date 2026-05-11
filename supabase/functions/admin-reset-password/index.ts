import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const callerId = claims.claims.sub as string;
    const body = await req.json().catch(() => ({}));
    const { target_user_id, target_email, new_password } = body ?? {};

    if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
      return json({ error: "Senha inválida (mínimo 6 caracteres)" }, 400);
    }
    if (!target_user_id && !target_email) {
      return json({ error: "Informe target_user_id ou target_email" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Authorization: caller must be platform_owner or security_admin
    const { data: roles } = await admin
      .from("platform_admin_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("is_active", true);
    const { data: prof } = await admin
      .from("profiles").select("is_platform_admin").eq("id", callerId).maybeSingle();
    const allowed =
      (prof?.is_platform_admin === true) ||
      (roles ?? []).some((r: { role: string }) =>
        ["platform_owner", "security_admin"].includes(r.role)
      );
    if (!allowed) return json({ error: "Acesso negado" }, 403);

    // Resolve target user id
    let userId = target_user_id as string | undefined;
    let email = target_email as string | undefined;
    if (!userId && email) {
      const { data: u } = await admin
        .from("profiles").select("id, email").eq("email", email).maybeSingle();
      if (!u) return json({ error: "Usuário não encontrado" }, 404);
      userId = u.id as string;
    }
    if (!userId) return json({ error: "Usuário não encontrado" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: new_password,
    });
    if (updErr) return json({ error: updErr.message }, 400);

    // Audit
    await admin.from("platform_admin_audit").insert({
      admin_user_id: callerId,
      event: "password_reset",
      route: "admin-reset-password",
      metadata: { target_user_id: userId, target_email: email ?? null },
    });

    return json({ ok: true, user_id: userId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
