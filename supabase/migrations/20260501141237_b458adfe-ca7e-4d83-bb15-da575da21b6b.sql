-- =========================================================================
-- Phase P3 — Platform-admin RBAC, sessions, MFA flag and governance audit
-- =========================================================================

-- Roles enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_admin_role') THEN
    CREATE TYPE public.platform_admin_role AS ENUM (
      'platform_owner','finance_admin','support_admin','security_admin'
    );
  END IF;
END$$;

-- Per-admin metadata extensions on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_disabled_reason text;

-- Role assignments (many-to-many user ↔ role)
CREATE TABLE IF NOT EXISTS public.platform_admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.platform_admin_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  granted_by uuid,
  granted_reason text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text,
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_par_user ON public.platform_admin_roles(user_id) WHERE is_active = true;
ALTER TABLE public.platform_admin_roles ENABLE ROW LEVEL SECURITY;

-- Sessions tracking (control plane only)
CREATE TABLE IF NOT EXISTS public.platform_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  ip text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pas_user ON public.platform_admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pas_active ON public.platform_admin_sessions(user_id) WHERE ended_at IS NULL;
ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;

-- Global enforcement flag (single-row table)
CREATE TABLE IF NOT EXISTS public.platform_admin_settings (
  id boolean PRIMARY KEY DEFAULT true,
  mfa_enforcement_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT only_one_row CHECK (id = true)
);
INSERT INTO public.platform_admin_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.platform_admin_settings ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- Helper: has a given platform-admin role (active, not expired)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.has_platform_role(_user uuid, _role public.platform_admin_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admin_roles r
    WHERE r.user_id = _user
      AND r.role = _role
      AND r.is_active = true
      AND (r.expires_at IS NULL OR r.expires_at > now())
  )
  OR (_role = 'platform_owner' AND COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user), false
  ));
$$;

-- Convenience: any admin role
CREATE OR REPLACE FUNCTION public.is_any_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user) OR EXISTS (
    SELECT 1 FROM public.platform_admin_roles r
    WHERE r.user_id = _user AND r.is_active
      AND (r.expires_at IS NULL OR r.expires_at > now())
  );
$$;

-- ==========================================================================
-- RLS policies
-- ==========================================================================
DROP POLICY IF EXISTS "security admins read roles" ON public.platform_admin_roles;
CREATE POLICY "security admins read roles" ON public.platform_admin_roles
  FOR SELECT TO authenticated
  USING (public.has_platform_role(auth.uid(), 'platform_owner')
      OR public.has_platform_role(auth.uid(), 'security_admin'));

DROP POLICY IF EXISTS "no direct write roles" ON public.platform_admin_roles;
CREATE POLICY "no direct write roles" ON public.platform_admin_roles
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "security admins read sessions" ON public.platform_admin_sessions;
CREATE POLICY "security admins read sessions" ON public.platform_admin_sessions
  FOR SELECT TO authenticated
  USING (public.has_platform_role(auth.uid(), 'platform_owner')
      OR public.has_platform_role(auth.uid(), 'security_admin')
      OR auth.uid() = user_id);

DROP POLICY IF EXISTS "users can register own session" ON public.platform_admin_sessions;
CREATE POLICY "users can register own session" ON public.platform_admin_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own session heartbeat" ON public.platform_admin_sessions;
CREATE POLICY "users update own session heartbeat" ON public.platform_admin_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND ended_at IS NULL);

DROP POLICY IF EXISTS "any admin reads settings" ON public.platform_admin_settings;
CREATE POLICY "any admin reads settings" ON public.platform_admin_settings
  FOR SELECT TO authenticated
  USING (public.is_any_platform_admin(auth.uid()));

-- ==========================================================================
-- Bootstrap: every existing is_platform_admin profile gets the owner role
-- ==========================================================================
INSERT INTO public.platform_admin_roles (user_id, role, granted_reason)
SELECT id, 'platform_owner'::public.platform_admin_role, 'bootstrap from is_platform_admin flag'
FROM public.profiles
WHERE is_platform_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- ==========================================================================
-- Internal helper: write to audit log (bypasses no-direct-insert RLS)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public._log_platform_admin_event(
  _event text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.platform_admin_actions_log
    (admin_user_id, email, event, metadata)
  SELECT auth.uid(),
         (SELECT email FROM public.profiles WHERE id = auth.uid()),
         _event,
         COALESCE(_metadata, '{}'::jsonb);
$$;

-- ==========================================================================
-- RPC: list admins (with active roles)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_list_admins()
RETURNS TABLE (
  user_id uuid, email text, display_name text,
  is_disabled boolean, mfa_required boolean,
  roles text[], created_at timestamptz, last_seen_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH admins AS (
    SELECT DISTINCT user_id FROM public.platform_admin_roles WHERE is_active
    UNION
    SELECT id FROM public.profiles WHERE is_platform_admin
  )
  SELECT
    a.user_id,
    p.email, p.display_name,
    (p.admin_disabled_at IS NOT NULL) AS is_disabled,
    p.mfa_required,
    COALESCE(
      (SELECT array_agg(r.role::text ORDER BY r.role::text)
       FROM public.platform_admin_roles r
       WHERE r.user_id = a.user_id AND r.is_active
         AND (r.expires_at IS NULL OR r.expires_at > now())),
      ARRAY[]::text[]
    ) AS roles,
    p.created_at,
    (SELECT MAX(last_seen_at) FROM public.platform_admin_sessions s WHERE s.user_id = a.user_id) AS last_seen_at
  FROM admins a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  ORDER BY p.email NULLS LAST;
END;
$$;

-- ==========================================================================
-- RPC: grant role
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_grant_role(
  _target_user uuid,
  _role public.platform_admin_role,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason required (>=4 chars)';
  END IF;

  INSERT INTO public.platform_admin_roles (user_id, role, granted_by, granted_reason)
  VALUES (_target_user, _role, auth.uid(), _reason)
  ON CONFLICT (user_id, role) DO UPDATE
    SET is_active = true,
        granted_by = EXCLUDED.granted_by,
        granted_reason = EXCLUDED.granted_reason,
        granted_at = now(),
        revoked_at = NULL, revoked_by = NULL, revoked_reason = NULL,
        expires_at = NULL
  RETURNING id INTO _id;

  -- Sync legacy flag for owner role
  IF _role = 'platform_owner' THEN
    UPDATE public.profiles SET is_platform_admin = true WHERE id = _target_user;
  END IF;

  PERFORM public._log_platform_admin_event(
    'role.granted',
    jsonb_build_object('target_user', _target_user, 'role', _role::text, 'reason', _reason)
  );
  RETURN _id;
END;
$$;

-- ==========================================================================
-- RPC: revoke role
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_revoke_role(
  _target_user uuid,
  _role public.platform_admin_role,
  _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason required (>=4 chars)';
  END IF;
  IF _target_user = auth.uid() AND _role = 'platform_owner' THEN
    RAISE EXCEPTION 'cannot revoke own platform_owner role';
  END IF;

  UPDATE public.platform_admin_roles
     SET is_active = false, revoked_at = now(),
         revoked_by = auth.uid(), revoked_reason = _reason
   WHERE user_id = _target_user AND role = _role;

  IF _role = 'platform_owner' THEN
    UPDATE public.profiles SET is_platform_admin = false WHERE id = _target_user;
  END IF;

  PERFORM public._log_platform_admin_event(
    'role.revoked',
    jsonb_build_object('target_user', _target_user, 'role', _role::text, 'reason', _reason)
  );
END;
$$;

-- ==========================================================================
-- RPC: enable / disable admin
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_set_disabled(
  _target_user uuid,
  _disabled boolean,
  _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason required (>=4 chars)';
  END IF;
  IF _target_user = auth.uid() AND _disabled THEN
    RAISE EXCEPTION 'cannot disable yourself';
  END IF;

  UPDATE public.profiles
     SET admin_disabled_at = CASE WHEN _disabled THEN now() ELSE NULL END,
         admin_disabled_reason = CASE WHEN _disabled THEN _reason ELSE NULL END
   WHERE id = _target_user;

  PERFORM public._log_platform_admin_event(
    CASE WHEN _disabled THEN 'admin.disabled' ELSE 'admin.enabled' END,
    jsonb_build_object('target_user', _target_user, 'reason', _reason)
  );
END;
$$;

-- ==========================================================================
-- RPC: revoke session
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_revoke_session(
  _session_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason required (>=4 chars)';
  END IF;

  UPDATE public.platform_admin_sessions
     SET ended_at = now(), ended_reason = _reason
   WHERE id = _session_id AND ended_at IS NULL;

  PERFORM public._log_platform_admin_event(
    'session.revoked',
    jsonb_build_object('session_id', _session_id, 'reason', _reason)
  );
END;
$$;

-- ==========================================================================
-- RPC: list audit log (paginated)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_list_audit(
  _search text DEFAULT NULL,
  _event text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, admin_user_id uuid, email text, event text,
  route text, ip text, user_agent text, metadata jsonb,
  created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT l.* FROM public.platform_admin_actions_log l
    WHERE (_event IS NULL OR l.event = _event)
      AND (_search IS NULL OR _search = ''
        OR l.email ILIKE '%' || _search || '%'
        OR l.event ILIKE '%' || _search || '%'
        OR l.metadata::text ILIKE '%' || _search || '%')
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.id, b.admin_user_id, b.email, b.event, b.route, b.ip, b.user_agent,
         b.metadata, b.created_at, c.c
    FROM base b CROSS JOIN counted c
   ORDER BY b.created_at DESC
   LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

-- ==========================================================================
-- RPC: toggle MFA enforcement (security_admin or owner only)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.platform_admin_set_mfa_enforcement(
  _enabled boolean,
  _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_platform_role(auth.uid(), 'platform_owner')
       OR public.has_platform_role(auth.uid(), 'security_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason required (>=4 chars)';
  END IF;

  UPDATE public.platform_admin_settings
     SET mfa_enforcement_enabled = _enabled,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true;

  PERFORM public._log_platform_admin_event(
    'mfa.enforcement_toggled',
    jsonb_build_object('enabled', _enabled, 'reason', _reason)
  );
END;
$$;

-- Hide from anon role
REVOKE ALL ON FUNCTION public.platform_admin_list_admins() FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_grant_role(uuid, public.platform_admin_role, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_revoke_role(uuid, public.platform_admin_role, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_set_disabled(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_revoke_session(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_list_audit(text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_set_mfa_enforcement(boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.has_platform_role(uuid, public.platform_admin_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_any_platform_admin(uuid) FROM anon;