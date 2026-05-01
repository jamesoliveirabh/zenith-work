# Runbook — Admin misoperation

## Symptoms
- Wrong plan/credit/cancel applied to customer
- Customer escalation pointing to a recent admin action
- Audit log shows action in `admin_actions_log`

## Impact
- Customer trust + financial exposure
- Possible compliance issue (GDPR / LGPD if sensitive data was exposed)

## Quick diagnosis
1. Find the offending entry:
   ```sql
   select * from admin_actions_log
   where target_workspace_id = '...'
   order by created_at desc limit 20;
   ```
2. Capture: actor, action, reason, before/after snapshot (if recorded).

## Mitigation
- Apply compensating action from admin UI **with a reason tagged `compensation:<original_log_id>`**.
- If multiple operators are affected by the same misuse, temporarily disable admin actions:
  set `BILLING_ADMIN_ACTIONS_ENABLED=false` (UI flag or env).
- Notify the customer if they were materially impacted.

## Validation
- Compensating audit row visible
- Customer's billing state matches expectation
- Operator coached / access reviewed

## Internal communication
> Identificamos ação administrativa equivocada em conta X. Compensação aplicada. Revisão de processo em andamento.
