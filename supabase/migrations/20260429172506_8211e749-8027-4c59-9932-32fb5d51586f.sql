-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

-- Storage policies
CREATE POLICY "Members upload attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Members read attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE POLICY "Owners delete attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Attachments table
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_attachments_task_id ON public.task_attachments(task_id);
CREATE INDEX idx_task_attachments_workspace_id ON public.task_attachments(workspace_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read attachments"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers create attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_workspace(workspace_id, auth.uid())
    AND auth.uid() = uploaded_by
  );

CREATE POLICY "Owners or admins delete attachments"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (
    auth.uid() = uploaded_by
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );