-- The learning tree now uses assigned-homework progress, not mastery aggregates.
-- Keep immutable archive copies before dropping the old subsystem.
BEGIN;

DO $$
DECLARE
  source_table TEXT;
  archive_table TEXT;
BEGIN
  FOREACH source_table IN ARRAY ARRAY[
    'mastery_evidence',
    'knowledge_block_mastery',
    'theory_mastery',
    'theory_mastery_by_level'
  ] LOOP
    IF to_regclass('public.' || source_table) IS NOT NULL THEN
      archive_table := source_table || '_archive_20260621';
      IF to_regclass('public.' || archive_table) IS NULL THEN
        EXECUTE format(
          'CREATE TABLE %I AS TABLE %I WITH DATA',
          archive_table,
          source_table
        );
        EXECUTE format(
          'COMMENT ON TABLE %I IS %L',
          archive_table,
          'Backup created before homework-progress migration on 2026-06-21'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS rebuild_all_mastery_evidence();
DROP FUNCTION IF EXISTS process_mastery_for_attempt(TEXT);
DROP FUNCTION IF EXISTS process_mastery_for_answer(TEXT);
DROP FUNCTION IF EXISTS refresh_knowledge_block_mastery(UUID, TEXT);
DROP FUNCTION IF EXISTS refresh_theory_mastery(UUID, TEXT);

DROP TABLE IF EXISTS mastery_evidence CASCADE;
DROP TABLE IF EXISTS knowledge_block_mastery CASCADE;
DROP TABLE IF EXISTS theory_mastery_by_level CASCADE;
DROP TABLE IF EXISTS theory_mastery CASCADE;

COMMIT;
