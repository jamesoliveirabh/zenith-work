
-- Phase P0: Global Backoffice — platform admin audit log
CREATE TABLE IF NOT EXISTS public.platform_admin_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event text NOT NULL, -- 'login' | 'logout' | 'access_denied' | 'navigate' | custom
  route text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_actions_log_user
  ON public.platform_admin_actions_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_actions_log_event
  ON public.platform_admin_actions_log(event, created_at DESC);

ALTER TABLE public.platform_admin_actions_log ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read the audit log
CREATE POLICY "platform admins can read audit log"
  ON public.platform_admin_actions_log
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Nobody writes directly; writes happen via SECURITY DEFINER RPC
CREATE POLICY "no direct insert"
  ON public.platform_admin_actions_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- RPC to record an event. Allows recording 'access_denied' for non-admins
-- (so we audit unauthorized access attempts), but other events require admin.
CREATE OR REPLACE FUNCTION public.log_platform_admin_event(
  _event text,
  _route text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- For events other than access_denied/login attempts, enforce admin role
  IF _event NOT IN ('access_denied', 'login_attempt') AND NOT public.is_platform_admin(_uid) THEN
    RAISE EXCEPTION 'forbidden: platform admin only';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  INSERT INTO public.platform_admin_actions_log (admin_user_id, email, event, route, metadata)
  VALUES (_uid, _email, _event, _route, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_platform_admin_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_platform_admin_event(text, text, jsonb) TO authenticated;

-- Convenience view: latest events (admin-only via RLS on base table)
COMMENT ON TABLE public.platform_admin_actions_log IS
  'Global audit log for the platform owner backoffice (admin.* host). Phase P0.';
