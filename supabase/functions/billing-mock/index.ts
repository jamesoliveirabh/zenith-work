// Phase H2: Billing mock engine.
// All mutations run as service_role; user identity is verified via JWT and the
// caller must be a member of the target workspace (admins required for most
// admin actions; documented per action below).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROVIDER = "mock";

type Json = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(msg: string, status = 400, extra?: Json) {
  return jsonResponse({ error: msg, ...(extra ?? {}) }, status);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

interface ActionCtx {
  admin: ReturnType<typeof createClient>;
  userId: string;
  isAdmin: boolean;
}

async function loadPlan(admin: ActionCtx["admin"], code: string) {
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordEvent(
  admin: ActionCtx["admin"],
  args: {
    workspaceId: string | null;
    subscriptionId: string | null;
    eventType: string;
    payload: Json;
    providerEventId?: string | null;
  },
) {
  const { error } = await admin.rpc("billing_record_event", {
    _workspace_id: args.workspaceId,
    _subscription_id: args.subscriptionId,
    _provider: PROVIDER,
    _event_type: args.eventType,
    _payload: args.payload,
    _provider_event_id: args.providerEventId ?? null,
  });
  if (error) throw error;
}

async function syncEntitlements(
  admin: ActionCtx["admin"],
  workspaceId: string,
  planId: string | null,
) {
  const { error } = await admin.rpc("billing_sync_entitlements", {
    _workspace_id: workspaceId,
    _plan_id: planId,
  });
  if (error) throw error;
}

async function logAdminAction(
  admin: ActionCtx["admin"],
  args: {
    adminUserId: string;
    workspaceId: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Json;
  },
) {
  await admin.from("admin_actions_log").insert({
    admin_user_id: args.adminUserId,
    workspace_id: args.workspaceId,
    action: args.action,
    target_type: args.targetType,
    target_id: args.targetId ?? null,
    metadata: args.metadata ?? {},
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actCreateSubscription(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  const planCode = String(body.planCode ?? "");
  const trialDays = Number(body.trialDays ?? 0) || 0;
  const providerEventId = body.providerEventId
    ? String(body.providerEventId)
    : null;
  if (!workspaceId || !planCode) return bad("workspaceId and planCode required");

  const plan = await loadPlan(ctx.admin, planCode);
  if (!plan) return bad("plan not found or inactive", 404);

  const now = new Date();
  const status = trialDays > 0 ? "trialing" : "active";
  const periodStart = now;
  const periodEnd =
    plan.interval === "year" ? addMonths(now, 12) : addMonths(now, 1);
  const trialEndsAt = trialDays > 0 ? addDays(now, trialDays) : null;

  const { data: existing } = await ctx.admin
    .from("workspace_subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let subId: string;
  if (existing?.id) {
    const { data, error } = await ctx.admin
      .from("workspace_subscriptions")
      .update({
        plan_id: plan.id,
        status,
        billing_provider: PROVIDER,
        trial_ends_at: trialEndsAt?.toISOString() ?? null,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: {},
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return bad(error.message, 500);
    subId = data.id;
  } else {
    const { data, error } = await ctx.admin
      .from("workspace_subscriptions")
      .insert({
        workspace_id: workspaceId,
        plan_id: plan.id,
        status,
        billing_provider: PROVIDER,
        trial_ends_at: trialEndsAt?.toISOString() ?? null,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select("id")
      .single();
    if (error) return bad(error.message, 500);
    subId = data.id;
  }

  await syncEntitlements(ctx.admin, workspaceId, plan.id);
  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: subId,
    eventType: "subscription.created",
    payload: { plan_code: plan.code, status, trial_days: trialDays },
    providerEventId,
  });
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId,
    action: "billing.subscription.create",
    targetType: "workspace_subscription",
    targetId: subId,
    metadata: { plan_code: plan.code, status },
  });

  return jsonResponse({ ok: true, subscription_id: subId, status });
}

async function actChangePlan(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  const newPlanCode = String(body.newPlanCode ?? "");
  const effectiveMode = (String(body.effectiveMode ?? "immediate") as
    | "immediate"
    | "next_cycle");
  if (!workspaceId || !newPlanCode) return bad("workspaceId and newPlanCode required");
  if (!["immediate", "next_cycle"].includes(effectiveMode))
    return bad("invalid effectiveMode");

  const plan = await loadPlan(ctx.admin, newPlanCode);
  if (!plan) return bad("plan not found or inactive", 404);

  const { data: sub, error: subErr } = await ctx.admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (subErr) return bad(subErr.message, 500);
  if (!sub) return bad("subscription not found", 404);

  if (effectiveMode === "next_cycle") {
    await ctx.admin
      .from("workspace_subscriptions")
      .update({
        metadata: {
          ...(sub.metadata ?? {}),
          pending_plan_change: {
            new_plan_id: plan.id,
            new_plan_code: plan.code,
            effective_at: sub.current_period_end,
            scheduled_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", sub.id);

    await recordEvent(ctx.admin, {
      workspaceId,
      subscriptionId: sub.id,
      eventType: "subscription.plan_changed",
      payload: {
        mode: "next_cycle",
        from_plan_id: sub.plan_id,
        to_plan_code: plan.code,
        effective_at: sub.current_period_end,
      },
    });
    return jsonResponse({ ok: true, mode: "next_cycle", effective_at: sub.current_period_end });
  }

  // immediate
  await ctx.admin
    .from("workspace_subscriptions")
    .update({
      plan_id: plan.id,
      status: sub.status === "past_due" ? "past_due" : "active",
      metadata: { ...(sub.metadata ?? {}), pending_plan_change: null },
    })
    .eq("id", sub.id);

  await syncEntitlements(ctx.admin, workspaceId, plan.id);

  // Simple prorated invoice mock (full plan price as adjustment)
  const { data: invoice } = await ctx.admin
    .from("workspace_invoices")
    .insert({
      workspace_id: workspaceId,
      subscription_id: sub.id,
      amount_due_cents: plan.price_cents,
      currency: plan.currency,
      status: "open",
      due_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: sub.id,
    eventType: "subscription.plan_changed",
    payload: {
      mode: "immediate",
      from_plan_id: sub.plan_id,
      to_plan_code: plan.code,
      adjustment_invoice_id: invoice?.id,
    },
  });
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId,
    action: "billing.subscription.change_plan",
    targetType: "workspace_subscription",
    targetId: sub.id,
    metadata: { mode: "immediate", to_plan_code: plan.code },
  });

  return jsonResponse({ ok: true, mode: "immediate", adjustment_invoice_id: invoice?.id });
}

async function actCancelAtPeriodEnd(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  if (!workspaceId) return bad("workspaceId required");

  const { data: sub } = await ctx.admin
    .from("workspace_subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub) return bad("subscription not found", 404);

  await ctx.admin
    .from("workspace_subscriptions")
    .update({
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: sub.id,
    eventType: "subscription.cancel_scheduled",
    payload: {},
  });
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId,
    action: "billing.subscription.cancel_scheduled",
    targetType: "workspace_subscription",
    targetId: sub.id,
  });

  return jsonResponse({ ok: true });
}

async function actResume(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  if (!workspaceId) return bad("workspaceId required");

  const { data: sub } = await ctx.admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub) return bad("subscription not found", 404);
  if (!sub.cancel_at_period_end) return bad("subscription is not scheduled for cancellation");
  if (sub.current_period_end && new Date(sub.current_period_end) < new Date())
    return bad("subscription period already ended");

  await ctx.admin
    .from("workspace_subscriptions")
    .update({ cancel_at_period_end: false, canceled_at: null })
    .eq("id", sub.id);

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: sub.id,
    eventType: "subscription.resumed",
    payload: {},
  });
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId,
    action: "billing.subscription.resume",
    targetType: "workspace_subscription",
    targetId: sub.id,
  });

  return jsonResponse({ ok: true });
}

async function actGenerateInvoice(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  const subscriptionId = String(body.subscriptionId ?? "");
  const amountDueCents = Number(body.amountDueCents ?? 0);
  const currency = String(body.currency ?? "BRL");
  const dueInDays = Number(body.dueInDays ?? 7);
  if (!workspaceId || !subscriptionId || amountDueCents < 0)
    return bad("workspaceId, subscriptionId and amountDueCents required");

  const { data, error } = await ctx.admin
    .from("workspace_invoices")
    .insert({
      workspace_id: workspaceId,
      subscription_id: subscriptionId,
      amount_due_cents: amountDueCents,
      currency,
      status: "open",
      due_at: addDays(new Date(), dueInDays).toISOString(),
    })
    .select("id")
    .single();
  if (error) return bad(error.message, 500);

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId,
    eventType: "invoice.created",
    payload: { invoice_id: data.id, amount_due_cents: amountDueCents, currency },
  });

  return jsonResponse({ ok: true, invoice_id: data.id });
}

async function actMarkInvoicePaid(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  const invoiceId = String(body.invoiceId ?? "");
  if (!workspaceId || !invoiceId) return bad("workspaceId and invoiceId required");

  const { data: inv, error: ie } = await ctx.admin
    .from("workspace_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (ie) return bad(ie.message, 500);
  if (!inv) return bad("invoice not found", 404);

  await ctx.admin
    .from("workspace_invoices")
    .update({
      status: "paid",
      amount_paid_cents: inv.amount_due_cents,
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (inv.subscription_id) {
    await ctx.admin
      .from("workspace_subscriptions")
      .update({ status: "active" })
      .eq("id", inv.subscription_id);
  }

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: inv.subscription_id,
    eventType: "invoice.paid",
    payload: { invoice_id: invoiceId, amount_paid_cents: inv.amount_due_cents },
  });
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId,
    action: "billing.invoice.mark_paid",
    targetType: "workspace_invoice",
    targetId: invoiceId,
  });

  return jsonResponse({ ok: true });
}

async function actSimulateFailure(ctx: ActionCtx, body: Json) {
  const workspaceId = String(body.workspaceId ?? "");
  const invoiceId = String(body.invoiceId ?? "");
  // Policy: keep invoice as 'open' (retryable). past_due on subscription.
  // If caller passes 'finalize: true', mark as 'uncollectible'.
  const finalize = Boolean(body.finalize ?? false);
  if (!workspaceId || !invoiceId) return bad("workspaceId and invoiceId required");

  const { data: inv } = await ctx.admin
    .from("workspace_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!inv) return bad("invoice not found", 404);

  const newStatus = finalize ? "uncollectible" : "open";
  await ctx.admin
    .from("workspace_invoices")
    .update({ status: newStatus })
    .eq("id", invoiceId);

  if (inv.subscription_id) {
    await ctx.admin
      .from("workspace_subscriptions")
      .update({ status: "past_due" })
      .eq("id", inv.subscription_id);
  }

  await recordEvent(ctx.admin, {
    workspaceId,
    subscriptionId: inv.subscription_id,
    eventType: "invoice.payment_failed",
    payload: { invoice_id: invoiceId, finalize, new_status: newStatus },
  });

  return jsonResponse({ ok: true, invoice_status: newStatus });
}

async function actCloseExpired(ctx: ActionCtx, _body: Json) {
  const { data, error } = await ctx.admin.rpc("billing_close_expired_cancellations");
  if (error) return bad(error.message, 500);
  await logAdminAction(ctx.admin, {
    adminUserId: ctx.userId,
    workspaceId: null,
    action: "billing.subscription.close_expired",
    targetType: "job",
    metadata: { closed_count: data },
  });
  return jsonResponse({ ok: true, closed: data });
}

const ACTIONS: Record<
  string,
  { adminRequired: boolean; handler: (ctx: ActionCtx, body: Json) => Promise<Response> }
> = {
  "subscription.create": { adminRequired: true, handler: actCreateSubscription },
  "subscription.change_plan": { adminRequired: true, handler: actChangePlan },
  "subscription.cancel": { adminRequired: true, handler: actCancelAtPeriodEnd },
  "subscription.resume": { adminRequired: true, handler: actResume },
  "subscription.close_expired": { adminRequired: true, handler: actCloseExpired },
  "invoice.generate": { adminRequired: true, handler: actGenerateInvoice },
  "invoice.mark_paid": { adminRequired: true, handler: actMarkInvoicePaid },
  "invoice.simulate_failure": { adminRequired: true, handler: actSimulateFailure },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return bad("Unauthorized", 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claimsData?.claims) return bad("Unauthorized", 401);
  const userId = claimsData.claims.sub as string;

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return bad("invalid json");
  }

  const action = String(body.action ?? "");
  const def = ACTIONS[action];
  if (!def) return bad(`unknown action: ${action}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authorization: caller must be a workspace admin (when workspaceId is given).
  // close_expired is the only cross-workspace job; restrict to any workspace admin.
  const workspaceId = body.workspaceId ? String(body.workspaceId) : null;
  if (workspaceId) {
    const { data: isAdmin, error: aErr } = await admin.rpc("is_workspace_admin", {
      _ws: workspaceId,
      _user: userId,
    });
    if (aErr) return bad(aErr.message, 500);
    if (!isAdmin) return bad("Forbidden: workspace admin required", 403);
  } else if (def.adminRequired && action === "subscription.close_expired") {
    // Conservative: require user to be admin of at least one workspace
    const { count } = await admin
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!count || count < 1) return bad("Forbidden", 403);
  }

  const ctx: ActionCtx = { admin, userId, isAdmin: true };

  try {
    return await def.handler(ctx, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing-mock] action failed:", action, msg);
    return bad(msg, 500);
  }
});
