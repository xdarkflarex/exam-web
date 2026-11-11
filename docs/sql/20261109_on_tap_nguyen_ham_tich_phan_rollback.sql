-- =====================================================================
-- HOÀN TÁC: xoá 5 đề ôn tập Nguyên hàm – Tích phân và 149 câu Q_NBV25_*
-- =====================================================================
-- Từ chối nếu đã có học sinh làm bất kỳ đề nào trong 5 đề (không xoá dữ liệu
-- bài làm). Khi đó hãy tắt xuất bản thay vì xoá.
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id IN ($nbv$ontap12-nguyenham-tn1$nbv$, $nbv$ontap12-nguyenham-tn2$nbv$, $nbv$ontap12-tichphan-tn$nbv$, $nbv$ontap12-nhtp-dungsai$nbv$, $nbv$ontap12-udtp-tlngan$nbv$)) THEN
    RAISE EXCEPTION 'DA_CO_BAI_LAM: có học sinh đã làm — hãy tắt xuất bản, đừng xoá';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_questions
             WHERE question_id LIKE 'Q\_NBV25\_%' AND exam_id NOT IN ($nbv$ontap12-nguyenham-tn1$nbv$, $nbv$ontap12-nguyenham-tn2$nbv$, $nbv$ontap12-tichphan-tn$nbv$, $nbv$ontap12-nhtp-dungsai$nbv$, $nbv$ontap12-udtp-tlngan$nbv$))
     OR EXISTS (SELECT 1 FROM public.homework_questions WHERE question_id LIKE 'Q\_NBV25\_%') THEN
    RAISE EXCEPTION 'CAU_DANG_DUOC_DUNG_O_NOI_KHAC: có đề/bài tập khác đang dùng câu Q_NBV25_*';
  END IF;
END
$guard$;

DELETE FROM public.exam_questions WHERE exam_id IN ($nbv$ontap12-nguyenham-tn1$nbv$, $nbv$ontap12-nguyenham-tn2$nbv$, $nbv$ontap12-tichphan-tn$nbv$, $nbv$ontap12-nhtp-dungsai$nbv$, $nbv$ontap12-udtp-tlngan$nbv$);
DELETE FROM public.exams WHERE id IN ($nbv$ontap12-nguyenham-tn1$nbv$, $nbv$ontap12-nguyenham-tn2$nbv$, $nbv$ontap12-tichphan-tn$nbv$, $nbv$ontap12-nhtp-dungsai$nbv$, $nbv$ontap12-udtp-tlngan$nbv$);
DELETE FROM public.question_taxonomy WHERE question_id LIKE 'Q\_NBV25\_%';
DELETE FROM public.answers WHERE question_id LIKE 'Q\_NBV25\_%';
DELETE FROM public.questions WHERE id LIKE 'Q\_NBV25\_%';

COMMIT;
