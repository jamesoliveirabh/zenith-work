-- Seed gestor permissions for all existing workspaces and update seed function

-- Update seed_role_permissions to include gestor by default for new workspaces
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_ws uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
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
  SELECT _ws, 'gestor'::public.workspace_role, key,
    key IN (
      'edit_statuses','manage_tags','create_tasks','delete_tasks','comment_tasks',
      'export_data','manage_custom_fields','manage_automations',
      'spaces.create','spaces.delete','teams.manage_members','lists.create','lists.delete'
    )
  FROM public.permission_catalog
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

REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM anon, authenticated;

-- Backfill gestor permissions for all existing workspaces (mirroring 'member' defaults + extras)
INSERT INTO public.role_permissions (workspace_id, role, permission_key, enabled)
SELECT DISTINCT rp.workspace_id, 'gestor'::public.workspace_role, pc.key,
  pc.key IN (
    'edit_statuses','manage_tags','create_tasks','delete_tasks','comment_tasks',
    'export_data','manage_custom_fields','manage_automations',
    'spaces.create','spaces.delete','teams.manage_members','lists.create','lists.delete'
  )
FROM public.role_permissions rp
CROSS JOIN public.permission_catalog pc
ON CONFLICT DO NOTHING;
