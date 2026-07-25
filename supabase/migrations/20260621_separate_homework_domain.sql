-- ============================================================
-- TÁCH HOÀN TOÀN HOMEWORK KHỎI EXAM
-- Giữ nguyên questions dùng chung. Migration chạy transaction.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS homeworks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  grade INTEGER CHECK (grade IN (10, 11, 12)),
  session_size INTEGER NOT NULL DEFAULT 10 CHECK (session_size > 0),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  homework_id TEXT NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(6,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(homework_id, question_id),
  UNIQUE(homework_id, order_index)
);

CREATE TABLE IF NOT EXISTS homework_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  homework_id TEXT NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_assignment_recipients (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (class_id IS NOT NULL AND student_id IS NULL) OR
    (class_id IS NULL AND student_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_recipient_class
  ON homework_assignment_recipients(assignment_id, class_id)
  WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_recipient_student
  ON homework_assignment_recipients(assignment_id, student_id)
  WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS homework_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'graded', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  current_session_index INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  answered_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS homework_answers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id TEXT NOT NULL REFERENCES homework_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  selected_answer TEXT,
  selected_answers JSONB,
  text_answer TEXT,
  is_correct BOOLEAN,
  score NUMERIC(6,2),
  shown_feedback BOOLEAN NOT NULL DEFAULT false,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS homework_knowledge_targets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  homework_id TEXT NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  knowledge_block_id TEXT REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  weight NUMERIC(6,3) NOT NULL DEFAULT 1 CHECK (weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_target_theory
  ON homework_knowledge_targets(homework_id, theory_id)
  WHERE knowledge_block_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_target_block
  ON homework_knowledge_targets(homework_id, knowledge_block_id)
  WHERE knowledge_block_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS homework_legacy_migration_audit (
  legacy_exam_id TEXT PRIMARY KEY,
  homework_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  recipient_count INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  answer_count INTEGER NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homework_questions_homework
  ON homework_questions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_assignments_homework
  ON homework_assignments(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_attempts_student
  ON homework_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_homework_answers_attempt
  ON homework_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_homework_targets_theory
  ON homework_knowledge_targets(theory_id);

DROP TRIGGER IF EXISTS update_homeworks_updated_at ON homeworks;
CREATE TRIGGER update_homeworks_updated_at BEFORE UPDATE ON homeworks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_homework_assignments_updated_at ON homework_assignments;
CREATE TRIGGER update_homework_assignments_updated_at BEFORE UPDATE ON homework_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_homework_attempts_updated_at ON homework_attempts;
CREATE TRIGGER update_homework_attempts_updated_at BEFORE UPDATE ON homework_attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_homework_answers_updated_at ON homework_answers;
CREATE TRIGGER update_homework_answers_updated_at BEFORE UPDATE ON homework_answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Snapshot counts before moving.
CREATE TEMP TABLE _legacy_homework_counts AS
SELECT
  e.id AS exam_id,
  COUNT(DISTINCT eq.id)::INTEGER AS question_count,
  COUNT(DISTINCT eas.id)::INTEGER AS recipient_count,
  COUNT(DISTINCT ea.id)::INTEGER AS attempt_count,
  COUNT(DISTINCT sa.id)::INTEGER AS answer_count
FROM exams e
LEFT JOIN exam_questions eq ON eq.exam_id = e.id
LEFT JOIN exam_assignments eas ON eas.exam_id = e.id
LEFT JOIN exam_attempts ea ON ea.exam_id = e.id
LEFT JOIN student_answers sa ON sa.attempt_id = ea.id
WHERE e.exam_mode = 'homework'
GROUP BY e.id;

INSERT INTO homeworks (
  id, title, description, grade, session_size, created_by,
  is_published, created_at, updated_at
)
SELECT
  e.id, e.title, e.description, e.grade, e.session_size, e.created_by,
  e.is_published, e.created_at, e.updated_at
FROM exams e
WHERE e.exam_mode = 'homework'
ON CONFLICT (id) DO NOTHING;

INSERT INTO homework_questions (
  id, homework_id, question_id, order_index, score, created_at
)
SELECT
  eq.id,
  eq.exam_id,
  eq.question_id,
  ROW_NUMBER() OVER (
    PARTITION BY eq.exam_id
    ORDER BY eq.part_number, eq.order_in_part, eq.created_at, eq.id
  ) - 1,
  COALESCE(eq.score, 1),
  eq.created_at
FROM exam_questions eq
JOIN exams e ON e.id = eq.exam_id AND e.exam_mode = 'homework'
ON CONFLICT DO NOTHING;

INSERT INTO homework_assignments (
  id, homework_id, assigned_by, title, deadline, status, created_at, updated_at
)
SELECT
  'legacy-' || e.id,
  e.id,
  COALESCE(
    (SELECT eas.assigned_by FROM exam_assignments eas
     WHERE eas.exam_id = e.id AND eas.assigned_by IS NOT NULL LIMIT 1),
    e.created_by
  ),
  e.title,
  e.end_time,
  CASE WHEN e.is_published THEN 'published' ELSE 'draft' END,
  e.created_at,
  e.updated_at
FROM exams e
WHERE e.exam_mode = 'homework'
ON CONFLICT (id) DO NOTHING;

INSERT INTO homework_assignment_recipients (
  id, assignment_id, class_id, student_id, created_at
)
SELECT
  eas.id::TEXT,
  'legacy-' || eas.exam_id,
  eas.class_id,
  eas.student_id,
  eas.created_at
FROM exam_assignments eas
JOIN exams e ON e.id = eas.exam_id AND e.exam_mode = 'homework'
ON CONFLICT DO NOTHING;

INSERT INTO homework_attempts (
  id, assignment_id, student_id, status, started_at, submitted_at,
  current_session_index, total_questions, answered_questions,
  correct_answers, score, created_at, updated_at
)
SELECT
  ea.id,
  'legacy-' || ea.exam_id,
  ea.student_id,
  ea.status,
  ea.start_time,
  ea.submit_time,
  ea.current_session_index,
  ea.total_questions,
  COALESCE((
    SELECT COUNT(*) FROM student_answers sa WHERE sa.attempt_id = ea.id
  ), 0),
  ea.correct_answers,
  ea.score,
  ea.created_at,
  ea.updated_at
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id AND e.exam_mode = 'homework'
ON CONFLICT DO NOTHING;

INSERT INTO homework_answers (
  id, attempt_id, question_id, question_type, selected_answer,
  selected_answers, text_answer, is_correct, score, shown_feedback,
  answered_at, updated_at
)
SELECT
  sa.id, sa.attempt_id, sa.question_id, sa.question_type,
  sa.selected_answer, sa.selected_answers, sa.text_answer,
  sa.is_correct, sa.score, sa.shown_feedback, sa.answered_at, sa.answered_at
FROM student_answers sa
JOIN exam_attempts ea ON ea.id = sa.attempt_id
JOIN exams e ON e.id = ea.exam_id AND e.exam_mode = 'homework'
ON CONFLICT DO NOTHING;

INSERT INTO homework_knowledge_targets (
  id, homework_id, theory_id, knowledge_block_id, weight, created_at
)
SELECT
  akt.id, akt.exam_id, akt.theory_id, akt.knowledge_block_id, akt.weight, akt.created_at
FROM assignment_knowledge_targets akt
JOIN exams e ON e.id = akt.exam_id AND e.exam_mode = 'homework'
ON CONFLICT DO NOTHING;

-- Abort before deleting source if any migrated count differs.
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM _legacy_homework_counts c
  WHERE c.question_count <> (
      SELECT COUNT(*) FROM homework_questions hq WHERE hq.homework_id = c.exam_id
    )
    OR c.recipient_count <> (
      SELECT COUNT(*) FROM homework_assignment_recipients hr
      WHERE hr.assignment_id = 'legacy-' || c.exam_id
    )
    OR c.attempt_count <> (
      SELECT COUNT(*) FROM homework_attempts ha
      WHERE ha.assignment_id = 'legacy-' || c.exam_id
    )
    OR c.answer_count <> (
      SELECT COUNT(*) FROM homework_answers hwa
      JOIN homework_attempts ha ON ha.id = hwa.attempt_id
      WHERE ha.assignment_id = 'legacy-' || c.exam_id
    );

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Homework migration count mismatch for % legacy homework(s)', v_bad;
  END IF;
END;
$$;

INSERT INTO homework_legacy_migration_audit (
  legacy_exam_id, homework_id, assignment_id,
  question_count, recipient_count, attempt_count, answer_count
)
SELECT
  exam_id, exam_id, 'legacy-' || exam_id,
  question_count, recipient_count, attempt_count, answer_count
FROM _legacy_homework_counts
ON CONFLICT (legacy_exam_id) DO UPDATE SET
  question_count = EXCLUDED.question_count,
  recipient_count = EXCLUDED.recipient_count,
  attempt_count = EXCLUDED.attempt_count,
  answer_count = EXCLUDED.answer_count,
  migrated_at = NOW();

DELETE FROM student_answers
WHERE attempt_id IN (
  SELECT ea.id FROM exam_attempts ea
  JOIN exams e ON e.id = ea.exam_id
  WHERE e.exam_mode = 'homework'
);
DELETE FROM exam_attempts
WHERE exam_id IN (SELECT id FROM exams WHERE exam_mode = 'homework');
DELETE FROM exam_assignments
WHERE exam_id IN (SELECT id FROM exams WHERE exam_mode = 'homework');
DELETE FROM assignment_knowledge_targets
WHERE exam_id IN (SELECT id FROM exams WHERE exam_mode = 'homework');
DELETE FROM exam_questions
WHERE exam_id IN (SELECT id FROM exams WHERE exam_mode = 'homework');
DELETE FROM exams WHERE exam_mode = 'homework';

ALTER TABLE homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_knowledge_targets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_homework_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE POLICY "Read published homeworks"
  ON homeworks FOR SELECT TO authenticated
  USING (is_published OR is_homework_admin());
CREATE POLICY "Admins manage homeworks"
  ON homeworks FOR ALL TO authenticated
  USING (is_homework_admin()) WITH CHECK (is_homework_admin());

CREATE POLICY "Read homework questions"
  ON homework_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage homework questions"
  ON homework_questions FOR ALL TO authenticated
  USING (is_homework_admin()) WITH CHECK (is_homework_admin());

CREATE POLICY "Read published homework assignments"
  ON homework_assignments FOR SELECT TO authenticated
  USING (status = 'published' OR is_homework_admin());
CREATE POLICY "Admins manage homework assignments"
  ON homework_assignments FOR ALL TO authenticated
  USING (is_homework_admin()) WITH CHECK (is_homework_admin());

CREATE POLICY "Read own homework recipients"
  ON homework_assignment_recipients FOR SELECT TO authenticated
  USING (
    is_homework_admin()
    OR student_id = auth.uid()
    OR class_id IN (SELECT class_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Admins manage homework recipients"
  ON homework_assignment_recipients FOR ALL TO authenticated
  USING (is_homework_admin()) WITH CHECK (is_homework_admin());

CREATE POLICY "Students read own homework attempts"
  ON homework_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_homework_admin());
CREATE POLICY "Students create own homework attempts"
  ON homework_attempts FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() OR is_homework_admin());
CREATE POLICY "Students update own homework attempts"
  ON homework_attempts FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR is_homework_admin())
  WITH CHECK (student_id = auth.uid() OR is_homework_admin());
CREATE POLICY "Admins delete homework attempts"
  ON homework_attempts FOR DELETE TO authenticated
  USING (is_homework_admin());

CREATE POLICY "Students read own homework answers"
  ON homework_answers FOR SELECT TO authenticated
  USING (
    is_homework_admin()
    OR EXISTS (
      SELECT 1 FROM homework_attempts
      WHERE homework_attempts.id = homework_answers.attempt_id
        AND homework_attempts.student_id = auth.uid()
    )
  );
CREATE POLICY "Students create own homework answers"
  ON homework_answers FOR INSERT TO authenticated
  WITH CHECK (
    is_homework_admin()
    OR EXISTS (
      SELECT 1 FROM homework_attempts
      WHERE homework_attempts.id = homework_answers.attempt_id
        AND homework_attempts.student_id = auth.uid()
    )
  );
CREATE POLICY "Students update own homework answers"
  ON homework_answers FOR UPDATE TO authenticated
  USING (
    is_homework_admin()
    OR EXISTS (
      SELECT 1 FROM homework_attempts
      WHERE homework_attempts.id = homework_answers.attempt_id
        AND homework_attempts.student_id = auth.uid()
    )
  );
CREATE POLICY "Admins delete homework answers"
  ON homework_answers FOR DELETE TO authenticated
  USING (is_homework_admin());

CREATE POLICY "Read homework knowledge targets"
  ON homework_knowledge_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage homework knowledge targets"
  ON homework_knowledge_targets FOR ALL TO authenticated
  USING (is_homework_admin()) WITH CHECK (is_homework_admin());

COMMIT;
