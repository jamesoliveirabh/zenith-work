# Runbook — Dunning travado

## Symptoms
- `billing_dunning_cases.state='recovering'` not progressing
- `billing.call.count{event=dunning.record_attempt}` flat for >1h
- Customers reporting that "estou em atraso há dias e nada acontece"

## Impact
- Revenue stuck mid-recovery
- Customers blocked in past_due longer than policy allows

## Quick diagnosis
1. Confirm scheduler/cron is running (or being invoked manually):
   ```sql
   select * from billing_dunning_attempts order by created_at desc limit 20;
   ```
2. Check for cases past their `next_retry_at` but with no recent attempt:
   ```sql
   select * from billing_dunning_list_due();
   ```
3. Health badge: `dunning.subsystem` should be **ok**. If **disabled**, dunning kill switch was engaged.

## Mitigation
- **Scheduler down**: invoke processor manually via edge function:
  `POST billing-mock { "action": "dunning.process_due" }`
- **Specific case stuck**: from admin → "Forçar tentativa" (audited) or "Estender carência".
- **Kill-switch engaged accidentally**: in admin settings, flip `dunningEnabled=true`.

## Validation
- `billing_dunning_attempts` shows new rows
- Cases transition `recovering → recovered` or `recovering → canceled`
- Past-due count begins to drop

## Internal communication
> Pipeline de cobrança em atraso reativado. Casos sendo reprocessados em ordem de prioridade.
