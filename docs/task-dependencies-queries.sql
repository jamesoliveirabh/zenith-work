-- =====================================================================
-- Task Dependencies — helper queries (NOT a migration; reference only)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fetch ALL dependencies of a given task (both directions).
--    direction = 'outgoing' → current task is the source
--                'incoming' → current task is the target
-- Parameters: :task_id
-- ---------------------------------------------------------------------
SELECT
  d.id,
  d.dependency_type,
  'outgoing'::text AS direction,
  d.target_task_id AS related_task_id,
  t.title          AS related_task_title,
  t.status_id      AS related_task_status_id,
  d.created_at,
  d.created_by
FROM public.task_dependencies d
JOIN public.tasks t ON t.id = d.target_task_id
WHERE d.source_task_id = :task_id

UNION ALL

SELECT
  d.id,
  d.dependency_type,
  'incoming'::text AS direction,
  d.source_task_id AS related_task_id,
  t.title          AS related_task_title,
  t.status_id      AS related_task_status_id,
  d.created_at,
  d.created_by
FROM public.task_dependencies d
JOIN public.tasks t ON t.id = d.source_task_id
WHERE d.target_task_id = :task_id

ORDER BY created_at DESC;


-- ---------------------------------------------------------------------
-- 2) Validate whether creating a dependency would introduce a cycle.
--    Normalized graph: from_task blocks to_task.
--    'blocked_by' edges are inverted; 'related_to' never cycles.
-- Parameters: :source_task_id, :target_task_id, :dependency_type
-- Returns: boolean would_cycle
-- ---------------------------------------------------------------------
WITH proposed AS (
  SELECT
    CASE
      WHEN :dependency_type = 'blocks'     THEN :source_task_id
      WHEN :dependency_type = 'blocked_by' THEN :target_task_id
    END AS edge_from,
    CASE
      WHEN :dependency_type = 'blocks'     THEN :target_task_id
      WHEN :dependency_type = 'blocked_by' THEN :source_task_id
    END AS edge_to
),
edges AS (
  SELECT source_task_id AS from_task, target_task_id AS to_task
    FROM public.task_dependencies WHERE dependency_type = 'blocks'
  UNION ALL
  SELECT target_task_id AS from_task, source_task_id AS to_task
    FROM public.task_dependencies WHERE dependency_type = 'blocked_by'
),
walk AS (
  SELECT e.to_task AS node
    FROM edges e, proposed p
   WHERE e.from_task = p.edge_to
  UNION
  SELECT e.to_task
    FROM edges e
    JOIN walk w ON e.from_task = w.node
)
SELECT
  CASE
    WHEN :dependency_type = 'related_to' THEN false
    ELSE EXISTS (SELECT 1 FROM walk w, proposed p WHERE w.node = p.edge_from)
  END AS would_cycle;

-- Equivalent helper function exposed by the migration:
--   SELECT public.task_dependency_would_cycle(:source, :target, :type);
