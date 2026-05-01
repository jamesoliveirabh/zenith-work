# Runbook — Rollback de Release (Backoffice Admin)

**Quando aplicar**: release recente do admin causa erros, dados inconsistentes ou comportamento errático.

## 1) Mitigação imediata

1. `/operations` → ative `platform_kill_switch` (motivo: "Rollback em andamento — release X").
2. Comunique stakeholders (financeiro, suporte) que mutações estão pausadas.

## 2) Rollback de código

1. No Lovable: abrir histórico de versões e restaurar a última versão estável anterior à release problemática.
2. Republique o frontend (Publish → Update).
3. Edge functions: deploy é automático ao reverter; confirme em `supabase/functions/*` que o código rollbackado está ativo.

## 3) Rollback de dados (se necessário)

- Migrações de schema: criar nova migração reversa (DROP/ALTER) — nunca editar migração já aplicada.
- Dados corrompidos: usar `/reconciliation` para corrigir divergências; histórico fica em `platform_reconciliation_log`.
- Para reverter mutações financeiras específicas: ver runbook `billing-admin-misoperation.md`.

## 4) Validação pós-rollback

- `/operations` → rodar "Check agora", confirmar 0 novos alertas críticos.
- `/metrics` → MRR e churn estáveis vs período anterior.
- `/reconciliation` → scan limpo.
- Smoke test: criar invoice mock, marcar paga, suspender/reativar workspace de teste.

## 5) Reativação

- Desligue `platform_kill_switch` com motivo.
- Resolva alertas abertos com nota referenciando o rollback.
- Postmortem com timeline e ação preventiva.

## Critério de fechamento

- Versão estável em produção, kill switch desligado, smoke test ok, postmortem aberto.
