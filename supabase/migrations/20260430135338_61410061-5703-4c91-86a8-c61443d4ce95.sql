-- ============================================================
-- MIGRATION: Add 'gestor' role to workspace_role enum and seed permissions
-- ============================================================

-- Add 'gestor' to the workspace_role enum if not already present.
-- Place it logically between 'admin' and 'member'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'workspace_role' AND e.enumlabel = 'gestor'
  ) THEN
    ALTER TYPE public.workspace_role ADD VALUE 'gestor' AFTER 'admin';
  END IF;
END $$;
