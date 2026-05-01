# Phase P0 — Platform Owner Backoffice

Painel global isolado do dono do SaaS, servido em **`admin.seudominio.com`** (subdomínio dedicado).

## Arquitetura

A mesma SPA decide em runtime qual app montar:

```
src/main.tsx
 ├── isAdminHost() === true  → AdminApp (rotas /login, /)
 └── isAdminHost() === false → App      (app cliente normal)
```

A detecção de host está em `src/lib/admin/host.ts` e considera, em ordem:

1. Override de dev: `?admin=1` (persistido em `sessionStorage`).
2. `window.location.hostname` começa com `admin.`.
3. Hostname igual ao configurado em `VITE_ADMIN_APP_BASE_URL`.

> Em produção, o ideal é hospedar o subdomínio `admin.*` como **build separado** desta mesma codebase. Como a P0 entrega a estrutura, manter os dois apps no mesmo bundle reduz fricção; a separação física fica trivial em P1+ (basta um segundo target Vite que importe `AdminApp` direto).

## Variáveis de ambiente

| Variável | Exemplo | Uso |
| --- | --- | --- |
| `VITE_ADMIN_APP_BASE_URL` | `https://admin.seudominio.com` | Identifica o host admin para detecção e links externos. |

## Autorização

- Usa o flag `profiles.is_platform_admin` (alias semântico de `platform_owner`) — já existente desde a Fase H7.
- Guarda de rota: `RequirePlatformOwner` em `src/components/admin-app/RequirePlatformOwner.tsx`.
- Não autenticado → redireciona para `/login` do admin.
- Autenticado mas não admin → renderiza tela `Acesso negado` (e audita o evento).

## Sessão isolada

O Supabase auth client persiste em `localStorage`. Como o navegador isola `localStorage` **por origem (subdomínio incluso)**, a sessão de `admin.seudominio.com` é naturalmente separada da de `app.seudominio.com`. Em dev (mesmo host), use o override `?admin=1` para alternar.

## Auditoria global

Tabela: `public.platform_admin_actions_log`

Eventos gravados via RPC `log_platform_admin_event(_event, _route, _metadata)`:

| Evento | Quando |
| --- | --- |
| `login` | Login bem-sucedido na tela `/login` do admin. |
| `login_attempt` | Falha de login (email + reason). |
| `logout` | Logout pelo header do AdminLayout. |
| `access_denied` | Usuário autenticado sem `is_platform_admin` cai na tela de acesso negado. |
| `navigate` | (reservado p/ uso futuro) |

RLS: somente platform admins leem; a RPC é `SECURITY DEFINER` e exige admin para qualquer evento que não seja `access_denied`/`login_attempt` (esses dois são abertos a qualquer autenticado para auditar tentativas).

## Teste manual

### Em produção
1. Aponte o DNS de `admin.seudominio.com` para o mesmo deploy.
2. Acesse `https://admin.seudominio.com/login`.
3. Entre com uma conta marcada como `is_platform_admin = true`.
4. Confirme que vê o dashboard e os eventos recentes.
5. Em outra aba anônima, entre com uma conta normal — deve ver "Acesso negado".
6. Verifique a tabela `platform_admin_actions_log` no banco — deve ter `login` e `access_denied`.

### Em dev (sandbox/preview)
1. Abra o preview com `?admin=1` na URL (ex.: `https://…lovable.app/?admin=1`).
2. O AdminApp passa a ser servido. Use `/login`.
3. Para voltar ao app cliente, use `?admin=0` (limpa o override).

### Promover um usuário a platform owner
```sql
UPDATE public.profiles SET is_platform_admin = true WHERE id = '<user_id>';
```

## TODOs P1+

- Construir métricas globais reais (MRR, churn, trial conversion).
- Mover backoffice de billing existente (`/admin/billing/*`) para dentro do AdminApp (atualmente vive no app cliente sob a mesma RBAC).
- Substituir o flag boolean `is_platform_admin` por uma tabela `platform_roles` quando surgir a necessidade de papéis múltiplos (`platform_owner`, `support`, `finance`).
- Hardening de cookies/CSRF dedicado quando o backend deixar de ser puramente Supabase JWT.
