# Billing — Production Readiness Report (Phase H9)

## Resumo executivo
Encerramento da Fase H9 com hardening de billing + backoffice. Produto está
pronto para **rollout em shadow mode** (`provider=mock`, `enforcementMode=warn_only`).
Ativação de provider real fica pendente da Fase H10 (integração Stripe/Pagar.me).

---

## Checklist de segurança

| Item | Status | Notas |
|---|---|---|
| RLS em tabelas billing/dunning/admin | ✅ | Deny-by-default; checagens em todas as RPCs admin |
| RBAC admin interno (`is_platform_admin`) | ✅ | Aplicado em rotas + edge function |
| Sanitização de logs (PII/secrets) | ✅ | `observability.ts` redige por padrão |
| Idempotência de eventos | ⚠️ TODO | `provider_event_id` armazenado; deduplicação a finalizar com webhooks reais (H10) |
| Validação de input em ações críticas | ✅ | Zod nos hooks; checagem server-side em RPCs |
| Rate-limit em endpoints sensíveis | 🚫 | Rate-limit interno não disponível; documentado em [no-backend-rate-limiting] |
| CORS restrito | ✅ | Edge function usa headers padrão Lovable |
| Auditoria de ações admin | ✅ | `admin_actions_log` obrigatório com `reason` |
| Kill switches | ✅ | `featureFlags.ts` + UI no admin |

---

## Cobertura de testes críticos

| Camada | Suite | Cenários |
|---|---|---|
| Domínio | `__tests__/domain.test.ts` | Derivação de períodos, status |
| Usage/Entitlements | `__tests__/usage.test.ts` | Cálculos de % e thresholds |
| Enforcement | `__tests__/enforcement.test.ts` | Modos warn/soft/hard |
| Dunning | `__tests__/dunning.test.ts` | Estados + tons de alerta |
| Observability | `__tests__/observability.test.ts` | Sanitização, contadores, instrumentação |
| Feature flags | `__tests__/featureFlags.test.ts` | Overrides + kill switch |
| Provider contract | `__tests__/provider.contract.test.ts` | Conformidade do mock provider |
| **E2E (in-memory)** | `test/e2e/billing/scenarios.e2e.test.ts` | 12 jornadas críticas (trial→active, upgrade, downgrade, cancel/resume, payment failure→recovery, grace exhausted, enforcement, admin audit, reconciliation) |

> **Nota tooling E2E**: Decidimos manter Vitest + harness em memória ao invés de Playwright/Cypress.
> Justificativa: o ambiente Lovable já usa Vitest; testes ficam determinísticos, rápidos (<1s) e
> rodam no CI sem dependência de stack externa. Quando o provider real entrar (H10), o mesmo
> arquivo de cenários pode ser re-executado contra um `LiveBillingHarness` que envolve o adapter
> real, sem precisar reescrever os testes.

---

## Observabilidade

- **Logs estruturados** (`observability.ts`):
  `correlation_id`, `workspace_id`, `subscription_id`, `invoice_id`, `actor_id`
  + redaction automática de chaves sensíveis.
- **Métricas em memória** (ring buffer + counters): latência por endpoint,
  outcome (ok/error), volume por evento. Pluggable via `addLogSink` / `addMetricSink`.
- **Health probe** (`health.ts`): DB plans, provider adapter, dunning, admin, kill switch.
- **Readiness probe** (`readiness.ts`): combina health + flags para decidir aceite de tráfego novo.
- **Preflight** (`preflight.ts`): consistência pré-go-live (subscriptions sem plano, faturas open >30d, etc.).
- **UI**: `BillingHealthBadge` no `/admin/billing` com auto-refresh 60s.

> **TODO observability externa**: integrar sinks com Logflare/Datadog/Sentry
> assim que houver decisão de stack — ponto de extensão já isolado.

---

## Feature flags & kill switches

Arquivo: `src/lib/billing/featureFlags.ts`. Fontes (em ordem): `import.meta.env` →
localStorage → defaults seguros.

| Flag | Default | Função |
|---|---|---|
| `provider` | `mock` | Switch de adapter (mock/stripe/pagarme) |
| `enforcementMode` | `warn_only` | Modo de enforcement por workspace |
| `adminActionsEnabled` | `true` | Liga/desliga mutations admin (UI + RPC) |
| `dunningEnabled` | `true` | Liga/desliga retries automáticos |
| `killSwitch` | `false` | Master kill — desliga billing não-essencial |

---

## Plano de rollout
Detalhado em [`runbooks/billing-rollout-rollback.md`](./runbooks/billing-rollout-rollback.md).

## Runbooks
- [`billing-payment-failure.md`](./runbooks/billing-payment-failure.md)
- [`billing-dunning-stuck.md`](./runbooks/billing-dunning-stuck.md)
- [`billing-reconciliation-incident.md`](./runbooks/billing-reconciliation-incident.md)
- [`billing-admin-misoperation.md`](./runbooks/billing-admin-misoperation.md)
- [`billing-rollout-rollback.md`](./runbooks/billing-rollout-rollback.md)

---

## Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Provider real ainda não plugado | Alta | Adapter contract pronto; H10 dedicado |
| Sem rate-limit nativo no backend | Média | Plataforma; risk owner = infra |
| Webhooks de provider não implementados | Média | Idempotência via `provider_event_id` já preparada |
| Cron de dunning é manual em homolog | Baixa | Função invocável + runbook |
| Sinks externos de telemetria ausentes | Baixa | Pluggable; decisão de stack pendente |

---

## Go / No-Go

**GO** para shadow mode em produção: ✅
**GO** para enforcement `soft_block` em coorte canário: ⚠️ apenas após H10 + 7 dias estáveis em `warn_only`
**GO** para `hard_block` global: 🚫 não nesta fase

---

## Rollback imediato
Em qualquer incidente P1:
```ts
import { setBillingFeatureFlagOverride } from '@/lib/billing/featureFlags';

setBillingFeatureFlagOverride({
  enforcementMode: 'warn_only',
  provider: 'mock',
  killSwitch: true,
});
```
+ pausar dunning (`dunningEnabled: false`) e seguir [`billing-rollout-rollback.md`](./runbooks/billing-rollout-rollback.md).
