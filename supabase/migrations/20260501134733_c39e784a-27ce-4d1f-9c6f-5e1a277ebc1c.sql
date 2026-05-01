
-- Phase P1: Client management for the platform owner backoffice.

-- 1) Suspension flags on workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE INDEX IF NOT EXISTS idx_workspaces_suspended
  ON public.workspaces(is_suspended) WHERE is_suspended = true;

-- 2) Internal notes (platform-admin only)
CREATE TABLE IF NOT EXISTS public.workspace_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_admin_notes_ws
  ON public.workspace_admin_notes(workspace_id, created_at DESC);

ALTER TABLE public.workspace_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins read notes"
  ON public.workspace_admin_notes FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "no direct insert notes"
  ON public.workspace_admin_notes FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "no direct update notes"
  ON public.workspace_admin_notes FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "no direct delete notes"
  ON public.workspace_admin_notes FOR DELETE TO authenticated
  USING (false);

-- 3) Helper: log to platform_admin_actions_log from SECURITY DEFINER context
CREATE OR REPLACE FUNCTION public._log_platform_event(
  _event text, _route text, _metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.platform_admin_actions_log
    (admin_user_id, email, event, route, metadata)
  VALUES (auth.uid(), _email, _event, _route, COALESCE(_metadata, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public._log_platform_event(text, text, jsonb) FROM public;

-- 4) List clients (with created_at window)
CREATE OR REPLACE FUNCTION public.platform_admin_list_clients(
  _search text DEFAULT NULL,
  _plan_code text DEFAULT NULL,
  _sub_status text DEFAULT NULL,
  _suspended_only boolean DEFAULT false,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
) RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  is_suspended boolean,
  suspended_at timestamptz,
  workspace_created_at timestamptz,
  owner_id uuid,
  owner_email text,
  owner_name text,
  plan_code text,
  plan_name text,
  sub_status text,
  current_period_end timestamptz,
  open_dunning_case_id uuid,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE _q text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := CASE WHEN _search IS NULL OR length(trim(_search)) = 0
              THEN NULL ELSE '%' || lower(trim(_search)) || '%' END;

  RETURN QUERY
  WITH base AS (
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.slug AS workspace_slug,
      w.is_suspended,
      w.suspended_at,
      w.created_at AS workspace_created_at,
      ws.user_id AS owner_id,
      p.email AS owner_email,
      p.display_name AS owner_name,
      pl.code AS plan_code,
      pl.name AS plan_name,
      sub.status::text AS sub_status,
      sub.current_period_end,
      (SELECT dc.id FROM public.billing_dunning_cases dc
        WHERE dc.workspace_id = w.id AND dc.status IN ('open','recovering')
        ORDER BY dc.created_at DESC LIMIT 1) AS open_dunning_case_id,
      GREATEST(w.updated_at, COALESCE(sub.updated_at, w.updated_at)) AS updated_at
    FROM public.workspaces w
    LEFT JOIN public.workspace_members ws
      ON ws.workspace_id = w.id AND ws.role = 'admin'
    LEFT JOIN public.profiles p ON p.id = ws.user_id
    LEFT JOIN public.workspace_subscriptions sub ON sub.workspace_id = w.id
    LEFT JOIN public.plans pl ON pl.id = sub.plan_id
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE
      (_q IS NULL
        OR lower(b.workspace_name) LIKE _q
        OR lower(COALESCE(b.workspace_slug, '')) LIKE _q
        OR lower(COALESCE(b.owner_email, '')) LIKE _q
        OR lower(COALESCE(b.owner_name, '')) LIKE _q
        OR b.workspace_id::text = trim(_search))
      AND (_plan_code IS NULL OR b.plan_code = _plan_code)
      AND (_sub_status IS NULL OR b.sub_status = _sub_status)
      AND (NOT _suspended_only OR b.is_suspended = true)
      AND (_created_after IS NULL OR b.workspace_created_at >= _created_after)
      AND (_created_before IS NULL OR b.workspace_created_at <= _created_before)
  )
  SELECT
    f.workspace_id, f.workspace_name, f.workspace_slug, f.is_suspended,
    f.suspended_at, f.workspace_created_at, f.owner_id, f.owner_email, f.owner_name,
    f.plan_code, f.plan_name, f.sub_status, f.current_period_end,
    f.open_dunning_case_id, f.updated_at,
    (SELECT COUNT(*) FROM filtered)::bigint AS total_count
  FROM filtered f
  ORDER BY f.workspace_created_at DESC NULLS LAST
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_list_clients(text,text,text,boolean,timestamptz,timestamptz,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_clients(text,text,text,boolean,timestamptz,timestamptz,integer,integer) TO authenticated;

-- 5) Detail (360)
CREATE OR REPLACE FUNCTION public.platform_admin_client_detail(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE _result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'workspace', to_jsonb(w),
    'owner', (
      SELECT to_jsonb(p) FROM public.workspace_members wm
      JOIN public.profiles p ON p.id = wm.user_id
      WHERE wm.workspace_id = w.id AND wm.role = 'admin'
      ORDER BY wm.created_at ASC LIMIT 1
    ),
    'member_count', (
      SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.workspace_id = w.id
    ),
    'subscription', (
      SELECT jsonb_build_object(
        'subscription', to_jsonb(s),
        'plan', to_jsonb(pl)
      )
      FROM public.workspace_subscriptions s
      LEFT JOIN public.plans pl ON pl.id = s.plan_id
      WHERE s.workspace_id = w.id
    ),
    'usage_snapshot', (
      SELECT jsonb_build_object(
        'lists', (SELECT COUNT(*) FROM public.lists WHERE workspace_id = w.id),
        'spaces', (SELECT COUNT(*) FROM public.spaces WHERE workspace_id = w.id),
        'tasks', (SELECT COUNT(*) FROM public.tasks WHERE workspace_id = w.id),
        'members', (SELECT COUNT(*) FROM public.workspace_members WHERE workspace_id = w.id),
        'docs', (SELECT COUNT(*) FROM public.docs WHERE workspace_id = w.id),
        'goals', (SELECT COUNT(*) FROM public.goals WHERE workspace_id = w.id)
      )
    ),
    'recent_events', (
      SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, event_type, created_at, payload, processed
        FROM public.billing_events
        WHERE workspace_id = w.id
        ORDER BY created_at DESC LIMIT 20
      ) e
    ),
    'admin_actions', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, target_type, target_id, metadata, created_at, admin_user_id
        FROM public.admin_actions_log
        WHERE workspace_id = w.id
        ORDER BY created_at DESC LIMIT 30
      ) a
    ),
    'platform_actions', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, event, email, route, metadata, created_at
        FROM public.platform_admin_actions_log
        WHERE (metadata->>'workspace_id')::uuid = w.id
        ORDER BY created_at DESC LIMIT 30
      ) a
    ),
    'notes', (
      SELECT COALESCE(jsonb_agg(n ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, body, author_id, author_email, created_at
        FROM public.workspace_admin_notes
        WHERE workspace_id = w.id
        ORDER BY created_at DESC
      ) n
    )
  )
  INTO _result
  FROM public.workspaces w
  WHERE w.id = _workspace_id;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'workspace not found';
  END IF;

  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_client_detail(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_admin_client_detail(uuid) TO authenticated;

-- 6) Suspend
CREATE OR REPLACE FUNCTION public.platform_admin_suspend_workspace(
  _workspace_id uuid, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  UPDATE public.workspaces
     SET is_suspended = true, suspended_at = now(), suspended_reason = _reason
   WHERE id = _workspace_id;

  PERFORM public._log_platform_event(
    'workspace.suspended',
    '/clients/' || _workspace_id::text,
    jsonb_build_object('workspace_id', _workspace_id, 'reason', _reason)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_suspend_workspace(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_admin_suspend_workspace(uuid,text) TO authenticated;

-- 7) Reactivate
CREATE OR REPLACE FUNCTION public.platform_admin_reactivate_workspace(
  _workspace_id uuid, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  UPDATE public.workspaces
     SET is_suspended = false, suspended_at = NULL, suspended_reason = NULL
   WHERE id = _workspace_id;

  PERFORM public._log_platform_event(
    'workspace.reactivated',
    '/clients/' || _workspace_id::text,
    jsonb_build_object('workspace_id', _workspace_id, 'reason', _reason)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_reactivate_workspace(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_admin_reactivate_workspace(uuid,text) TO authenticated;

-- 8) Add internal note
CREATE OR REPLACE FUNCTION public.platform_admin_add_note(
  _workspace_id uuid, _body text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid; _email text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _body IS NULL OR length(trim(_body)) < 1 THEN
    RAISE EXCEPTION 'body required';
  END IF;
  IF length(_body) > 2000 THEN
    RAISE EXCEPTION 'body too long (max 2000 chars)';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.workspace_admin_notes (workspace_id, author_id, author_email, body)
  VALUES (_workspace_id, auth.uid(), _email, _body)
  RETURNING id INTO _id;

  PERFORM public._log_platform_event(
    'workspace.note_added',
    '/clients/' || _workspace_id::text,
    jsonb_build_object('workspace_id', _workspace_id, 'note_id', _id)
  );

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_add_note(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_admin_add_note(uuid,text) TO authenticated;
