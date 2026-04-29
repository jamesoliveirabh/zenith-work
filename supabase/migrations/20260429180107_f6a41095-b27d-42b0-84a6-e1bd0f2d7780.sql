-- ============== Tables ==============
CREATE TABLE public.docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  parent_doc_id UUID REFERENCES public.docs(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Sem título',
  content JSONB,
  content_text TEXT,
  icon TEXT,
  cover_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_token UUID NOT NULL DEFAULT gen_random_uuid(),
  position INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  last_edited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_workspace ON public.docs(workspace_id);
CREATE INDEX idx_docs_parent ON public.docs(parent_doc_id);
CREATE INDEX idx_docs_space ON public.docs(space_id);
CREATE INDEX idx_docs_published ON public.docs(published_token) WHERE is_published;
CREATE INDEX idx_docs_fts ON public.docs
  USING gin(to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content_text, '')));

CREATE TABLE public.doc_members (
  doc_id UUID NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'comment', 'edit', 'full')),
  PRIMARY KEY (doc_id, user_id)
);

CREATE TABLE public.doc_task_links (
  doc_id UUID NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (doc_id, task_id)
);
CREATE INDEX idx_doc_task_links_task ON public.doc_task_links(task_id);

-- ============== RLS ==============
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_task_links ENABLE ROW LEVEL SECURITY;

-- docs: members read; writers create; creators or admins update/delete; published docs publicly readable
CREATE POLICY "Members read docs" ON public.docs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Public read published docs" ON public.docs FOR SELECT TO anon
  USING (is_published = true);

CREATE POLICY "Writers create docs" ON public.docs FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Creators or admins update docs" ON public.docs FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_workspace_admin(workspace_id, auth.uid())
         OR public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "Creators or admins delete docs" ON public.docs FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_workspace_admin(workspace_id, auth.uid()));

-- doc_members
CREATE POLICY "Members read doc members" ON public.doc_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.docs d WHERE d.id = doc_id AND public.is_workspace_member(d.workspace_id, auth.uid())));

CREATE POLICY "Creators or admins add doc members" ON public.doc_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.docs d WHERE d.id = doc_id
    AND (d.created_by = auth.uid() OR public.is_workspace_admin(d.workspace_id, auth.uid()))));

CREATE POLICY "Creators or admins update doc members" ON public.doc_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.docs d WHERE d.id = doc_id
    AND (d.created_by = auth.uid() OR public.is_workspace_admin(d.workspace_id, auth.uid()))));

CREATE POLICY "Creators or admins delete doc members" ON public.doc_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.docs d WHERE d.id = doc_id
    AND (d.created_by = auth.uid() OR public.is_workspace_admin(d.workspace_id, auth.uid()))));

-- doc_task_links
CREATE POLICY "Members read doc task links" ON public.doc_task_links FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers create doc task links" ON public.doc_task_links FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "Writers delete doc task links" ON public.doc_task_links FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

-- ============== Trigger: auto-update updated_at + last_edited_by ==============
CREATE OR REPLACE FUNCTION public.sync_doc_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF auth.uid() IS NOT NULL THEN
    NEW.last_edited_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_doc_metadata
  BEFORE UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION public.sync_doc_metadata();

-- ============== Storage buckets ==============
INSERT INTO storage.buckets (id, name, public)
VALUES ('doc-covers', 'doc-covers', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('doc-images', 'doc-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Doc covers public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'doc-covers');
CREATE POLICY "Authenticated upload doc covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-covers');
CREATE POLICY "Authenticated update doc covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'doc-covers');
CREATE POLICY "Authenticated delete doc covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-covers');

CREATE POLICY "Doc images public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'doc-images');
CREATE POLICY "Authenticated upload doc images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-images');
CREATE POLICY "Authenticated delete doc images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-images');

-- ============== Update global_search to include docs ==============
CREATE OR REPLACE FUNCTION public.global_search(p_workspace_id uuid, p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(result_type text, id uuid, title text, subtitle text, url_path text, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RETURN;
  END IF;
  IF p_query IS NULL OR length(trim(p_query)) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT 'task'::TEXT AS result_type, t.id, t.title,
      (l.name || ' › ' || COALESCE(sc.name, '—')) AS subtitle,
      ('/list/' || t.list_id::TEXT) AS url_path, t.updated_at
    FROM public.tasks t
    JOIN public.lists l ON l.id = t.list_id
    LEFT JOIN public.status_columns sc ON sc.id = t.status_id
    WHERE t.workspace_id = p_workspace_id
      AND t.title ILIKE '%' || p_query || '%'
      AND public.user_can_access_list(t.list_id, auth.uid())
    UNION ALL
    SELECT 'list'::TEXT, l.id, l.name, s.name AS subtitle,
      ('/list/' || l.id::TEXT) AS url_path, l.updated_at
    FROM public.lists l
    JOIN public.spaces s ON s.id = l.space_id
    WHERE l.workspace_id = p_workspace_id
      AND l.name ILIKE '%' || p_query || '%'
      AND public.user_can_access_list(l.id, auth.uid())
    UNION ALL
    SELECT 'space'::TEXT, s.id, s.name, ''::TEXT AS subtitle,
      ('/space/' || s.id::TEXT) AS url_path, s.updated_at
    FROM public.spaces s
    WHERE s.workspace_id = p_workspace_id
      AND s.name ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'doc'::TEXT, d.id, d.title,
      COALESCE(s.name, 'Workspace') AS subtitle,
      ('/docs/' || d.id::TEXT) AS url_path, d.updated_at
    FROM public.docs d
    LEFT JOIN public.spaces s ON s.id = d.space_id
    WHERE d.workspace_id = p_workspace_id
      AND (d.title ILIKE '%' || p_query || '%' OR d.content_text ILIKE '%' || p_query || '%')
  )
  SELECT * FROM combined
  ORDER BY updated_at DESC
  LIMIT p_limit;
END;
$function$;