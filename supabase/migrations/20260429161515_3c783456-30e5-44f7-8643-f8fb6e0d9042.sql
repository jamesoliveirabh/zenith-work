-- Add description_text column for plain-text search
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description_text TEXT;

-- Backfill description_text from existing TEXT description
UPDATE public.tasks SET description_text = description WHERE description IS NOT NULL AND description_text IS NULL;

-- Convert description from TEXT to JSONB, wrapping existing text into a Tiptap doc
ALTER TABLE public.tasks
  ALTER COLUMN description TYPE JSONB
  USING (
    CASE
      WHEN description IS NULL OR description = '' THEN NULL
      ELSE jsonb_build_object(
        'type', 'doc',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', description)
            )
          )
        )
      )
    END
  );

-- Function to extract plain text from a Tiptap JSON document
CREATE OR REPLACE FUNCTION public.tiptap_to_text(_doc JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  result TEXT := '';
  node JSONB;
BEGIN
  IF _doc IS NULL THEN RETURN NULL; END IF;
  IF _doc ? 'text' THEN
    RETURN _doc->>'text';
  END IF;
  IF _doc ? 'content' THEN
    FOR node IN SELECT * FROM jsonb_array_elements(_doc->'content') LOOP
      result := result || COALESCE(public.tiptap_to_text(node), '') || ' ';
    END LOOP;
  END IF;
  RETURN trim(result);
END;
$$;

-- Trigger to keep description_text in sync
CREATE OR REPLACE FUNCTION public.sync_task_description_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.description_text := public.tiptap_to_text(NEW.description);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_description_text ON public.tasks;
CREATE TRIGGER trg_sync_task_description_text
BEFORE INSERT OR UPDATE OF description ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_description_text();