import { supabase } from "@/integrations/supabase/client";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Divergence = {
  validator: string;
  severity: Severity;
  workspace_id: string | null;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
};

export type ScanResult = {
  scanned_at: string;
  counts: { critical: number; high: number; medium: number; low: number; total: number };
  divergences: Divergence[];
};

export type ReconLogRow = {
  id: string;
  kind: "scan" | "fix";
  validator: string | null;
  severity: Severity | null;
  workspace_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  details: Record<string, any>;
  reason: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: string;
};

export async function runReconciliationScan(): Promise<ScanResult> {
  const { data, error } = await supabase.rpc("platform_admin_reconciliation_scan" as any);
  if (error) throw error;
  return data as ScanResult;
}

export async function applyReconciliationFix(input: {
  validator: string;
  entity_type: string;
  entity_id: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("platform_admin_reconciliation_fix" as any, {
    _validator: input.validator,
    _entity_type: input.entity_type,
    _entity_id: input.entity_id,
    _reason: input.reason,
  });
  if (error) throw error;
  return data as { ok: boolean; action: string; before: any; after: any };
}

export async function fetchReconciliationHistory(kind?: "scan" | "fix", limit = 100) {
  const { data, error } = await supabase.rpc("platform_admin_reconciliation_history" as any, {
    _limit: limit,
    _kind: kind ?? null,
  });
  if (error) throw error;
  return (data as ReconLogRow[]) ?? [];
}

export const VALIDATOR_LABELS: Record<string, string> = {
  subscription_missing_invoice: "Assinatura ativa sem invoice esperada",
  paid_invoice_past_due_sub: "Invoice paga, mas assinatura past_due",
  dunning_open_invoice_paid: "Dunning aberto sobre invoice já paga",
  duplicate_billing_event: "Evento de billing duplicado",
  unprocessed_billing_event: "Evento não processado há >1h",
};

export const FIX_LABELS: Record<string, string> = {
  subscription_missing_invoice: "Marcar como revisado (flag em metadata)",
  paid_invoice_past_due_sub: "Reativar assinatura (status → active)",
  dunning_open_invoice_paid: "Encerrar caso (status → recovered)",
  duplicate_billing_event: "Manter o mais antigo, deduplicar os demais",
  unprocessed_billing_event: "Marcar como processado",
};
