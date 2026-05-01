-- =========================================================================
-- Phase H1: Billing foundation (mock mode, no real gateway)
-- =========================================================================

-- 1) plans
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NULL,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  interval text NOT NULL CHECK (interval IN ('month','year')),
  is_active boolean NOT NULL DEFAULT true,
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) workspace_subscriptions
CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NULL REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','incomplete')),
  billing_provider text NOT NULL DEFAULT 'mock',
  provider_customer_id text NULL,
  provider_subscription_id text NULL,
  trial_ends_at timestamptz NULL,
  current_period_start timestamptz NULL,
  current_period_end timestamptz NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_subscriptions_workspace_unique UNIQUE (workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_plan ON public.workspace_subscriptions(plan_id);

-- 3) workspace_entitlements
CREATE TABLE IF NOT EXISTS public.workspace_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  limit_value integer NULL,
  current_usage integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_entitlements_ws_feature_unique UNIQUE (workspace_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_workspace_entitlements_ws ON public.workspace_entitlements(workspace_id);

-- 4) workspace_invoices
CREATE TABLE IF NOT EXISTS public.workspace_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid NULL REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  provider_invoice_id text NULL,
  amount_due_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL CHECK (status IN ('draft','open','paid','void','uncollectible')),
  due_at timestamptz NULL,
  paid_at timestamptz NULL,
  hosted_invoice_url text NULL,
  invoice_pdf_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspace_invoices_ws ON public.workspace_invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invoices_sub ON public.workspace_invoices(subscription_id);

-- 5) billing_events
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid NULL REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mock',
  provider_event_id text NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_event_unique
  ON public.billing_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_ws ON public.billing_events(workspace_id);

-- 6) admin_actions_log
CREATE TABLE IF NOT EXISTS public.admin_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NULL,
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_log_ws ON public.admin_actions_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_log_admin ON public.admin_actions_log(admin_user_id);

-- =========================================================================
-- updated_at triggers (reuse public.set_updated_at())
-- =========================================================================
DROP TRIGGER IF EXISTS trg_plans_updated ON public.plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_subscriptions_updated ON public.workspace_subscriptions;
CREATE TRIGGER trg_workspace_subscriptions_updated BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_entitlements_updated ON public.workspace_entitlements;
CREATE TRIGGER trg_workspace_entitlements_updated BEFORE UPDATE ON public.workspace_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_invoices_updated ON public.workspace_invoices;
CREATE TRIGGER trg_workspace_invoices_updated BEFORE UPDATE ON public.workspace_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- Seed: planos padrão (idempotente via upsert por code)
-- =========================================================================
INSERT INTO public.plans (code, name, description, price_cents, currency, interval, is_active, limits_json) VALUES
  ('free', 'Free', 'Plano gratuito inicial', 0, 'BRL', 'month', true,
    '{"members": 5, "automations": 1, "storage_gb": 1}'::jsonb),
  ('pro', 'Pro', 'Plano Pro para equipes em crescimento', 9900, 'BRL', 'month', true,
    '{"members": 20, "automations": 10, "storage_gb": 10}'::jsonb),
  ('business', 'Business', 'Plano Business para empresas', 29900, 'BRL', 'month', true,
    '{"members": 100, "automations": 100, "storage_gb": 100}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  interval = EXCLUDED.interval,
  is_active = EXCLUDED.is_active,
  limits_json = EXCLUDED.limits_json,
  updated_at = now();

-- =========================================================================
-- RLS: leitura por membros do workspace; escrita restrita (service role only)
-- =========================================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions_log ENABLE ROW LEVEL SECURITY;

-- plans: catálogo público para usuários autenticados (leitura apenas dos ativos)
DROP POLICY IF EXISTS "Authenticated read active plans" ON public.plans;
CREATE POLICY "Authenticated read active plans" ON public.plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- workspace_subscriptions: membros leem; escrita somente service_role (sem policy = bloqueado para anon/auth)
DROP POLICY IF EXISTS "Members read subscription" ON public.workspace_subscriptions;
CREATE POLICY "Members read subscription" ON public.workspace_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- workspace_entitlements: membros leem
DROP POLICY IF EXISTS "Members read entitlements" ON public.workspace_entitlements;
CREATE POLICY "Members read entitlements" ON public.workspace_entitlements
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- workspace_invoices: somente admins do workspace leem
DROP POLICY IF EXISTS "Admins read invoices" ON public.workspace_invoices;
CREATE POLICY "Admins read invoices" ON public.workspace_invoices
  FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- billing_events: apenas service_role (nenhuma policy para authenticated => deny)
-- TODO H2+: expor leitura limitada para admins quando necessário.

-- admin_actions_log: apenas service_role (nenhuma policy para authenticated => deny)
-- TODO H2+: expor leitura para admins do workspace quando UI de auditoria for criada.
