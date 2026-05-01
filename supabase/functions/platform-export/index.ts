// Phase P7 — Internal BI export endpoint.
// Authenticated endpoint that returns CSV for any of the supported datasets.
// Authorization is enforced via the underlying RPC (is_any_platform_admin).
// Auditing happens automatically inside the RPC (_platform_admin_log_export).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Dataset = "clients" | "subscriptions" | "invoices" | "dunning" | "audit";

const RPC_MAP: Record<Dataset, string> = {
  clients: "platform_admin_export_clients",
  subscriptions: "platform_admin_export_subscriptions",
  invoices: "platform_admin_export_invoices",
  dunning: "platform_admin_export_dunning",
  audit: "platform_admin_export_audit",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(dataset: Dataset, rows: Record<string, unknown>[], filters: unknown, generatedAt: string) {
  const lines: string[] = [
    `# dataset=${dataset}`,
    `# generated_at=${generatedAt}`,
    `# row_count=${rows.length}`,
    `# filters=${JSON.stringify(filters)}`,
    `# generator=platform-export-edge`,
  ];
  if (rows.length === 0) {
    lines.push("(empty)");
    return lines.join("\n");
  }
  const headers = Object.keys(rows[0]);
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const dataset = (url.searchParams.get("dataset") ?? "") as Dataset;
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    if (!RPC_MAP[dataset]) {
      return new Response(JSON.stringify({ error: "Invalid dataset" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const planCode = url.searchParams.get("plan_code");
    const event = url.searchParams.get("event");
    const createdAfter = url.searchParams.get("created_after");
    const createdBefore = url.searchParams.get("created_before");
    const suspendedOnly = url.searchParams.get("suspended_only") === "true";

    const common: Record<string, unknown> = {
      _search: search,
      _created_after: createdAfter,
      _created_before: createdBefore,
      _source: "api",
    };
    let params: Record<string, unknown> = common;
    switch (dataset) {
      case "clients":
        params = { ...common, _plan_code: planCode, _sub_status: status, _suspended_only: suspendedOnly };
        break;
      case "subscriptions":
        params = { ...common, _status: status, _plan_code: planCode };
        break;
      case "invoices":
      case "dunning":
        params = { ...common, _status: status };
        break;
      case "audit":
        params = { ...common, _event: event };
        break;
    }

    const { data, error } = await supabase.rpc(RPC_MAP[dataset], params);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const generatedAt = new Date().toISOString();
    const filters = { search, status, planCode, event, createdAfter, createdBefore, suspendedOnly };

    if (format === "json") {
      return new Response(
        JSON.stringify({ dataset, generated_at: generatedAt, filters, row_count: rows.length, rows }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const csv = toCsv(dataset, rows, filters, generatedAt);
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dataset}_${generatedAt.replace(/[:.]/g, "-")}.csv"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
