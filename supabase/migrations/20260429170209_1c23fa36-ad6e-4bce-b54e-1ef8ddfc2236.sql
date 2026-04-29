CREATE OR REPLACE FUNCTION public.global_search(
  p_workspace_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  result_type TEXT,
  id UUID,
  title TEXT,
  subtitle TEXT,
  url_path TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Caller must be a member of the workspace.
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RETURN;
  END IF;

  IF p_query IS NULL OR length(trim(p_query)) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH combined AS (
    -- Tasks (respect per-list access)
    SELECT
      'task'::TEXT AS result_type,
      t.id,
      t.title,
      (l.name || ' › ' || COALESCE(sc.name, '—')) AS subtitle,
      ('/list/' || t.list_id::TEXT) AS url_path,
      t.updated_at
    FROM public.tasks t
    JOIN public.lists l ON l.id = t.list_id
    LEFT JOIN public.status_columns sc ON sc.id = t.status_id
    WHERE t.workspace_id = p_workspace_id
      AND t.title ILIKE '%' || p_query || '%'
      AND public.user_can_access_list(t.list_id, auth.uid())

    UNION ALL

    -- Lists (respect per-list access)
    SELECT
      'list'::TEXT,
      l.id,
      l.name,
      s.name AS subtitle,
      ('/list/' || l.id::TEXT) AS url_path,
      l.updated_at
    FROM public.lists l
    JOIN public.spaces s ON s.id = l.space_id
    WHERE l.workspace_id = p_workspace_id
      AND l.name ILIKE '%' || p_query || '%'
      AND public.user_can_access_list(l.id, auth.uid())

    UNION ALL

    -- Spaces
    SELECT
      'space'::TEXT,
      s.id,
      s.name,
      ''::TEXT AS subtitle,
      ('/space/' || s.id::TEXT) AS url_path,
      s.updated_at
    FROM public.spaces s
    WHERE s.workspace_id = p_workspace_id
      AND s.name ILIKE '%' || p_query || '%'
  )
  SELECT * FROM combined
  ORDER BY updated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(UUID, TEXT, INT) TO authenticated;