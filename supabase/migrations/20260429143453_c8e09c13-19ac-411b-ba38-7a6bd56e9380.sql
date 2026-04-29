-- Allow workspace owner to delete spaces too
DROP POLICY IF EXISTS "Admins delete spaces" ON public.spaces;
DROP POLICY IF EXISTS "Admins or owner delete spaces" ON public.spaces;

CREATE POLICY "Admins or owner delete spaces"
ON public.spaces
FOR DELETE
TO authenticated
USING (
  is_workspace_admin(workspace_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = spaces.workspace_id AND w.owner_id = auth.uid()
  )
);

-- Audit trigger for spaces (create/delete/rename) for visibility in security
CREATE OR REPLACE FUNCTION public.audit_spaces()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'space.created', 'space', NEW.id, jsonb_build_object('name', NEW.name));
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.log_audit(NEW.workspace_id, 'space.renamed', 'space', NEW.id, jsonb_build_object('from', OLD.name, 'to', NEW.name));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'space.deleted', 'space', OLD.id, jsonb_build_object('name', OLD.name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS audit_spaces_trigger ON public.spaces;
CREATE TRIGGER audit_spaces_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.spaces
FOR EACH ROW EXECUTE FUNCTION public.audit_spaces();