-- Workspace invitations table
CREATE TABLE public.workspace_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  email TEXT NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (workspace_id, email, status)
);

CREATE INDEX idx_invitations_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX idx_invitations_email ON public.workspace_invitations(lower(email));

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Members can read invitations of their workspaces
CREATE POLICY "Members read invitations"
ON public.workspace_invitations
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Admins create invitations
CREATE POLICY "Admins create invitations"
ON public.workspace_invitations
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()) AND auth.uid() = invited_by);

-- Admins update (revoke) invitations
CREATE POLICY "Admins update invitations"
ON public.workspace_invitations
FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Admins delete invitations
CREATE POLICY "Admins delete invitations"
ON public.workspace_invitations
FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- RPC to accept invitation by token (security definer to bypass member-only RLS)
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO inv FROM public.workspace_invitations
  WHERE token = _token AND status = 'pending' AND expires_at > now();

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  IF lower(inv.email) <> lower(user_email) THEN
    RAISE EXCEPTION 'This invitation is for a different email address';
  END IF;

  -- Add as member (idempotent)
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (inv.workspace_id, auth.uid(), inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = inv.id;

  RETURN inv.workspace_id;
END;
$$;

-- Ensure unique constraint exists for ON CONFLICT above
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_user_unique'
  ) THEN
    ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id);
  END IF;
END $$;