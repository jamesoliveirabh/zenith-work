# Runbook — Billing payment failure

## Symptoms
- Spike of `subscription.status = past_due`
- `billing.call.count{event=invoice.simulate_failure,outcome=ok}` rising
- Past-due banner visible to many tenants
- Customer reports of "cobrança não passou"

## Impact
- Revenue at risk (recovery rate drops)
- Customers may lose access if `enforcement_mode != warn_only` and grace expires
- Increased support volume

## Quick diagnosis
1. Open `/admin/billing` → Health badge.
   - If `provider.*` is `down`/`degraded`, the issue is upstream (provider/network).
   - If health is OK but past-due is rising, the failure is real.
2. Pull recent billing logs:
   ```sql
   select event, level, count(*)
   from billing_events
   where created_at > now() - interval '1 hour'
   group by 1,2 order by 3 desc;
   ```
3. Check dunning queue: `select count(*) from billing_dunning_cases where state in ('open','recovering');`

## Mitigation
- **Provider outage**: engage `BILLING_PROVIDER` kill switch (set `killSwitch=true`) to stop new charges; communicate with provider.
- **Configuration regression**: revert last billing migration / config change.
- **Customer-specific**: from `/admin/billing/accounts/:id` → "Estender período de carência" with a written reason (audited).

## Validation
- Health badge returns to **Operacional**
- Past-due rate trends back down within 1 hour
- `billing_dunning_cases.state='recovered'` count grows

## Internal communication
> Estamos investigando aumento de falhas de cobrança. Operações em modo conservador (kill switch ativo). Atualização em 30 min.
