# Go / No-Go Checklist — Backoffice Admin (admin.seudominio.com)

Aprovação final antes do go-live em produção.

## 1. Segurança & Acesso
- [ ] RBAC validado (platform_owner, finance_admin, support_admin, security_admin)
- [ ] RLS habilitado em todas tabelas sensíveis (`platform_admin_*`, `billing_*`, `subscriptions`, `invoices`)
- [ ] MFA configurado para perfis admin (flag em `platform_admin_settings`)
- [ ] Heartbeat de sessão (60s) ativo + revogação testada
- [ ] Auditoria cobre 100% das mutações administrativas
- [ ] Edge function `platform-export` valida JWT em produção

## 2. Operação Financeira
- [ ] Provider mock validado em homologação (suspend/reactivate, invoice gen, marcar paga, dunning retry, grace period)
- [ ] Dunning policy default configurada (max_retries, grace_period_days)
- [ ] Reconciliação executada — 0 divergências críticas
- [ ] Plano fallback documentado caso provider real falhe

## 3. Observabilidade
- [ ] Alertas operacionais ativos (`past_due_spike`, `churn_spike`, `mutation_failures`)
- [ ] Cronograma de checagem definido (manual ou via cron externo)
- [ ] Métricas executivas (`/metrics`) batem com fonte (queries diretas)
- [ ] Logs de saúde billing visíveis em `BillingHealthBadge`

## 4. Recuperação & Rollback
- [ ] `platform_kill_switch` testado (ativar → confirmar bloqueio → desativar)
- [ ] Runbooks revisados:
  - [ ] `docs/runbooks/billing-admin-misoperation.md`
  - [ ] `docs/runbooks/billing-dunning-stuck.md`
  - [ ] `docs/runbooks/billing-payment-failure.md`
  - [ ] `docs/runbooks/billing-reconciliation-incident.md`
  - [ ] `docs/runbooks/billing-rollout-rollback.md`
  - [ ] `docs/runbooks/admin-security-incident.md`
  - [ ] `docs/runbooks/admin-rollback.md`
- [ ] Rollback testado em staging (versão anterior + republish)

## 5. Dados & Exports
- [ ] Exports CSV validados nos 5 datasets (clients, subscriptions, invoices, dunning, audit)
- [ ] Histórico de exports auditado (`platform_admin_exports_log`)
- [ ] Endpoint `platform-export` testado com token de admin

## 6. Testes
- [ ] E2E críticos passando (`src/test/e2e/admin/*`)
  - [ ] suspend/reactivate workspace
  - [ ] generate invoice + marcar paga
  - [ ] reconciliation fix
  - [ ] role grant/revoke
  - [ ] flag set / kill switch
- [ ] Testes de RLS (acesso negado para não-admins)

## 7. Comunicação
- [ ] Time de suporte treinado em `/clients`
- [ ] Time financeiro treinado em `/finance` e `/exports`
- [ ] Plano de comunicação para incidentes (canal, on-call)

## Aprovação

| Papel | Nome | Assinatura | Data |
|-------|------|------------|------|
| Platform Owner | | | |
| Security Admin | | | |
| Finance Admin | | | |

## Riscos residuais aceitos

_Liste aqui itens que vão a produção com mitigação parcial e justificativa._

- ...
