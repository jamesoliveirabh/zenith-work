
-- 1. Restrict profiles SELECT
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Profiles readable to self or shared workspace members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members wm_self
    JOIN public.workspace_members wm_other
      ON wm_other.workspace_id = wm_self.workspace_id
    WHERE wm_self.user_id = auth.uid()
      AND wm_other.user_id = profiles.id
  )
);

-- 2. Tighten doc-covers and doc-images storage policies
-- Path convention enforced: <user_id>/<doc_id>/<file>
DROP POLICY IF EXISTS "Doc covers public read" ON storage.objects;
DROP POLICY IF EXISTS "Doc covers authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Doc covers authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Doc covers authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Doc images public read" ON storage.objects;
DROP POLICY IF EXISTS "Doc images authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Doc images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Doc images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Public read doc covers" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload doc covers" ON storage.objects;
DROP POLICY IF EXISTS "Auth update doc covers" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete doc covers" ON storage.objects;
DROP POLICY IF EXISTS "Public read doc images" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload doc images" ON storage.objects;
DROP POLICY IF EXISTS "Auth update doc images" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete doc images" ON storage.objects;

-- Public read remains (buckets are public for inline rendering)
CREATE POLICY "Doc covers public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'doc-covers');

CREATE POLICY "Doc images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'doc-images');

-- INSERT only into own folder
CREATE POLICY "Doc covers owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'doc-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Doc images owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'doc-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- UPDATE / DELETE only own files
CREATE POLICY "Doc covers owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'doc-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Doc covers owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'doc-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Doc images owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'doc-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Doc images owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'doc-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. seed_role_permissions: require admin and revoke public execute
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_ws uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow when called from a trigger (auth.uid() may be the workspace owner creating the workspace)
  -- but still require that, when called interactively, the caller is an admin of the workspace.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_workspace_admin(_ws, auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = _ws AND owner_id = auth.uid())
  THEN
    RAISE EXCEPTION 'Permission denied: admin required';
  END IF;

  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'admin'::public.workspace_role, key, true FROM public.permission_catalog
  ON CONFLICT DO NOTHING;

  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'member'::public.workspace_role, key,
    key IN ('edit_statuses','manage_tags','create_tasks','delete_tasks','comment_tasks','export_data','manage_custom_fields','manage_automations')
  FROM public.permission_catalog
  ON CONFLICT DO NOTHING;

  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'member_limited'::public.workspace_role, key,
    key IN ('create_tasks','comment_tasks','manage_tags')
  FROM public.permission_catalog
  ON CONFLICT DO NOTHING;

  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'guest'::public.workspace_role, key,
    key IN ('comment_tasks')
  FROM public.permission_catalog
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM anon, authenticated, public;

-- 4. Revoke EXECUTE on internal helper SECURITY DEFINER functions that should only be invoked from triggers/RLS
REVOKE EXECUTE ON FUNCTION public.handle_new_workspace() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_list() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_lists() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_list_permissions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_workspace_members() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_workspace_invitations() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_list_role_permissions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_spaces() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, text, text, uuid, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_space_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_member_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_list_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_task_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_attachment_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_comment_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_task_assignment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_task_comment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_task_automations() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_comment_automations() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_task_count_targets() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_doc_metadata() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_task_description_text() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.task_link_path(uuid) FROM anon, authenticated, public;

-- 5. Realtime channel authorization
-- Restrict realtime.messages so only workspace members can subscribe to channels named after a workspace id
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read realtime" ON realtime.messages;
CREATE POLICY "Workspace members read realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  -- Allow generic postgres_changes subscriptions (topic = 'realtime:*') only to authenticated users
  -- AND require workspace membership when topic encodes a workspace id pattern "ws:<uuid>".
  (
    (realtime.topic() LIKE 'ws:%')
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = substring(realtime.topic() FROM 4)
    )
  )
  OR (
    realtime.topic() NOT LIKE 'ws:%'
    AND auth.uid() IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Workspace members broadcast realtime" ON realtime.messages;
CREATE POLICY "Workspace members broadcast realtime"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
