
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_ws UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
$$;

DO $$
DECLARE w RECORD;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
    SELECT w.id, 'member_limited'::public.workspace_role, key,
      key IN ('create_tasks','comment_tasks','manage_tags')
    FROM public.permission_catalog
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
