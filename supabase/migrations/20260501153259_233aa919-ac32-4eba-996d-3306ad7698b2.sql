DROP FUNCTION IF EXISTS public._seed_homolog_users();

CREATE FUNCTION public._seed_homolog_users()
RETURNS TABLE(out_label text, out_email text, out_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
DECLARE
  v_pwd_hash text := extensions.crypt('Homolog@2026', extensions.gen_salt('bf'));
  v_users    jsonb := jsonb_build_array(
    jsonb_build_object('label','owner',         'email','owner@homolog.flow.dev',         'name','Olivia Owner'),
    jsonb_build_object('label','manager',       'email','manager@homolog.flow.dev',       'name','Marcos Manager'),
    jsonb_build_object('label','member',        'email','member@homolog.flow.dev',        'name','Marina Member'),
    jsonb_build_object('label','platform_owner','email','platform.owner@homolog.flow.dev','name','Pedro Platform'),
    jsonb_build_object('label','finance_admin', 'email','finance@homolog.flow.dev',       'name','Fabiana Finance'),
    jsonb_build_object('label','support_admin', 'email','support@homolog.flow.dev',       'name','Sofia Support'),
    jsonb_build_object('label','security_admin','email','security@homolog.flow.dev',      'name','Sergio Security')
  );
  v_rec   jsonb;
  v_uid   uuid;
  v_role  text;
  v_email text;
  v_name  text;
BEGIN
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_users)
  LOOP
    v_email := v_rec->>'email';
    v_name  := v_rec->>'name';
    v_role  := v_rec->>'label';

    SELECT u.id INTO v_uid FROM auth.users u WHERE u.email = v_email;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
        v_pwd_hash, now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        jsonb_build_object('display_name', v_name, 'seed','homolog'),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), v_uid, v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', v_email),
        'email', now(), now(), now()
      ) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.profiles (id, display_name, email, is_platform_admin)
    VALUES (
      v_uid, v_name, v_email,
      v_role IN ('platform_owner','finance_admin','support_admin','security_admin')
    )
    ON CONFLICT (id) DO UPDATE
      SET display_name      = EXCLUDED.display_name,
          email             = EXCLUDED.email,
          is_platform_admin = EXCLUDED.is_platform_admin;

    IF v_role IN ('platform_owner','finance_admin','support_admin','security_admin') THEN
      INSERT INTO public.platform_admin_roles (user_id, role, is_active, granted_reason)
      VALUES (v_uid, v_role::platform_admin_role, true, 'seed:homolog')
      ON CONFLICT DO NOTHING;
    END IF;

    out_label   := v_role;
    out_email   := v_email;
    out_user_id := v_uid;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public._seed_homolog_users() FROM anon, authenticated;