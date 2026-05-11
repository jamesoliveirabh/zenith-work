-- Função para permitir que admins resetem senhas de usuários
-- Esta função é chamada pela edge function para verificar permissões
CREATE OR REPLACE FUNCTION public.platform_admin_reset_password(
  _target_user UUID,
  _new_password TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  -- Verificar se o chamador tem role de admin (platform_owner ou security_admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller
      AND role IN ('platform_owner', 'security_admin')
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_owner ou security_admin';
  END IF;

  -- Registrar audit
  INSERT INTO platform_admin_audit (admin_user_id, email, event, route, metadata)
  SELECT 
    caller,
    (SELECT email FROM auth.users WHERE id = caller),
    'password_reset',
    'platform-admin-reset-password',
    jsonb_build_object('target_user', _target_user, 'reason', 'admin_reset');
END;
$$;