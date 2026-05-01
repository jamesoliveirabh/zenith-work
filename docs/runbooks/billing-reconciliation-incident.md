# Runbook — Reconciliation incident

## Symptoms
- Preflight (`runBillingPreflight`) returns `ok=false`
- Divergence between provider state and our DB (e.g., paid invoice still `open`)
- Support: "paguei mas continuo bloqueado"

## Impact
- Customers may be over- or under-charged
- Wrong enforcement decisions
- Audit + compliance risk

## Quick diagnosis
1. Run preflight from admin or call `runBillingPreflight()` and inspect findings.
2. Cross-check a sample case in provider dashboard vs. local DB:
   ```sql
   select * from workspace_invoices where id = '...';
   select * from workspace_subscriptions where workspace_id = '...';
   ```
3. Look for these high-severity findings:
   - `subs.without_plan` → broken FK to plan
   - `paid_invoice_dunning_open` → recovery flow didn't close
   - `past_due_without_dunning` → dunning case not opened

## Mitigation
- **Single account**: use admin actions ("Marcar fatura como paga" / "Reabrir caso") with reason; audited.
- **Bulk drift**: do NOT mass-mutate from UI. Open incident, snapshot affected IDs, decide between
  (a) re-run reconciliation job in dry mode, (b) targeted SQL migration with explicit allowlist.
- **Provider out of sync**: trigger provider re-sync (when adapter supports it; TODO H10).

## Validation
- Preflight returns `ok=true`
- Affected accounts show consistent state
- New audit entries cover every mutation

## Internal communication
> Detectada inconsistência entre provedor e nosso registro em N contas. Correções aplicadas com auditoria. Pós-mortem em até 48h.
