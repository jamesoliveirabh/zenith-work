/**
 * Phase P7 — Operational/financial exports for BI and accounting.
 * All RPCs are SECURITY DEFINER and validate is_any_platform_admin server-side.
 * Each call is auditing automatically into platform_admin_exports_log.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

export type ExportDataset =
  | "clients"
  | "subscriptions"
  | "invoices"
  | "dunning"
  | "audit";

export interface ExportFilters {
  search?: string;
  status?: string;
  planCode?: string;
  suspendedOnly?: boolean;
  event?: string;
  createdAfter?: string | null;
  createdBefore?: string | null;
}

export const DATASET_LABELS: Record<ExportDataset, string> = {
  clients: "Clientes (workspaces)",
  subscriptions: "Assinaturas",
  invoices: "Faturas",
  dunning: "Cobrança (dunning)",
  audit: "Auditoria admin",
};

export interface ExportLogRow {
  id: string;
  dataset: string;
  filters: Record<string, unknown>;
  row_count: number;
  source: string;
  actor_email: string | null;
  created_at: string;
  total_count: number;
}

async function callExport(dataset: ExportDataset, f: ExportFilters): Promise<Record<string, unknown>[]> {
  const common = {
    _search: f.search?.trim() || null,
    _created_after: f.createdAfter || null,
    _created_before: f.createdBefore || null,
    _source: "ui",
  };

  let fn = "";
  let params: Record<string, unknown> = common;

  switch (dataset) {
    case "clients":
      fn = "platform_admin_export_clients";
      params = {
        ...common,
        _plan_code: f.planCode || null,
        _sub_status: f.status || null,
        _suspended_only: f.suspendedOnly ?? false,
      };
      break;
    case "subscriptions":
      fn = "platform_admin_export_subscriptions";
      params = { ...common, _status: f.status || null, _plan_code: f.planCode || null };
      break;
    case "invoices":
      fn = "platform_admin_export_invoices";
      params = { ...common, _status: f.status || null };
      break;
    case "dunning":
      fn = "platform_admin_export_dunning";
      params = { ...common, _status: f.status || null };
      break;
    case "audit":
      fn = "platform_admin_export_audit";
      params = { ...common, _event: f.event || null };
      break;
  }

  const { data, error } = await rpc(fn, params);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function runExport(dataset: ExportDataset, filters: ExportFilters) {
  const rows = await callExport(dataset, filters);
  return { rows, generatedAt: new Date().toISOString(), filters, dataset };
}

export async function listExportLog(limit = 100, offset = 0): Promise<ExportLogRow[]> {
  const { data, error } = await rpc("platform_admin_list_exports", {
    _limit: limit,
    _offset: offset,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExportLogRow[];
}

// ====== CSV building with metadata header ======
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(opts: {
  dataset: ExportDataset;
  rows: Record<string, unknown>[];
  filters: ExportFilters;
  generatedAt: string;
}): string {
  const { dataset, rows, filters, generatedAt } = opts;
  const lines: string[] = [];
  lines.push(`# dataset=${dataset}`);
  lines.push(`# generated_at=${generatedAt}`);
  lines.push(`# row_count=${rows.length}`);
  lines.push(`# filters=${JSON.stringify(filters)}`);
  lines.push(`# generator=platform-admin-backoffice`);

  if (rows.length === 0) {
    lines.push("(empty)");
    return lines.join("\n");
  }
  const headers = Object.keys(rows[0]);
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
