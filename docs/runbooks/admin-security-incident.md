# Runbook — Incidente de Segurança (Backoffice Admin)

**Quando aplicar**: comprometimento suspeito de conta admin, vazamento de credencial, atividade anormal em `/security/sessions`, alerta de `mutation_failures` correlacionado a um único usuário.

## 1) Contenção imediata (≤ 5 min)

1. Acesse `/operations` → ative `platform_kill_switch` com motivo.
   - Bloqueia mutações sensíveis (suspend/reactivate, finance, role grant).
2. Acesse `/security/sessions` → revogue todas as sessões ativas do usuário suspeito.
3. Acesse `/security/admin-users` → remova papéis ativos do usuário (motivo obrigatório).

## 2) Investigação

- `/security/audit` — filtre por `email` do suspeito nas últimas 24h.
- `/exports` → dataset `audit` no período, baixe CSV para análise offline.
- Cruze com `/clients/:id` (ações por workspace) e `/finance/*` (mutações financeiras).

## 3) Remediação

- Reset de credencial via provedor de autenticação.
- Reabilitar MFA (`/security/admin-users` → flag global).
- Reverter ações suspeitas: ver runbook financeiro / reconciliação.

## 4) Pós-incidente

- Resolva alertas em `/operations` com nota explicando ação.
- Desative `platform_kill_switch` (com motivo).
- Documente timeline no ticket interno.

## Critério de fechamento

- Sessões maliciosas revogadas, papéis revisados, audit trail anexado, kill switch desligado.
