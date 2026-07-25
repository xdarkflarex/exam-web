-- PATCH_VERSION: essay-legacy-config-backfill-20260723-r1
-- One-time repair for six unused legacy essay questions discovered after the
-- 20260721 assisted-grading migration. Run only after the matching diagnostic.

BEGIN;

DO $guard$
DECLARE
  v_question_ids text[] := ARRAY[
    'Q_1771832119893_8ZJSD0J',
    'Q_1771832119894_DIPQPB5',
    'Q_1771832119895_OOZJE8P',
    'Q_1784633634868_2RH17R6',
    'Q_1784633634869_87EILC8',
    'Q_1784633634873_2XVUW0R'
  ];
BEGIN
  PERFORM 1
  FROM public.questions question_row
  WHERE question_row.id = ANY(v_question_ids)
  FOR UPDATE;

  IF (
    SELECT COUNT(*)
    FROM public.questions question_row
    WHERE question_row.id = ANY(v_question_ids)
      AND question_row.question_type = 'essay'
  ) <> 6 THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_SOURCE_SET_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = ANY(v_question_ids)
      AND question_row.essay_max_score IS DISTINCT FROM 1::numeric
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_SCORE_ALREADY_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_grading_configs grading_config
    WHERE grading_config.question_id = ANY(v_question_ids)
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONFIG_ALREADY_EXISTS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exam_questions row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.homework_questions row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.student_answers row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_ALREADY_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1771832119895_OOZJE8P'
      AND NULLIF(btrim(question_row.solution), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CURVED_WALL_SOLUTION_ALREADY_CHANGED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1784633634873_2XVUW0R'
      AND position(
        '$s$ là quãng đường vật đi được trong khoảng thời gian đó.'
        IN question_row.content
      ) > 0
  ) THEN
    RAISE EXCEPTION 'MOTION_QUESTION_SOURCE_CHANGED';
  END IF;
END;
$guard$;

UPDATE public.questions question_row
SET
  essay_max_score = expected.max_score,
  updated_at = now()
FROM (
  VALUES
    ('Q_1771832119893_8ZJSD0J'::text, 1::numeric),
    ('Q_1771832119894_DIPQPB5'::text, 1::numeric),
    ('Q_1771832119895_OOZJE8P'::text, 1::numeric),
    ('Q_1784633634868_2RH17R6'::text, 1.5::numeric),
    ('Q_1784633634869_87EILC8'::text, 1::numeric),
    ('Q_1784633634873_2XVUW0R'::text, 0.5::numeric)
) AS expected(question_id, max_score)
WHERE question_row.id = expected.question_id;

UPDATE public.questions
SET
  content = content || $wall_assumption$

(Trong mô hình bài toán, coi thiết diện vuông góc với $AB$ không đổi dọc theo đoạn $AB$.)
$wall_assumption$,
  updated_at = now()
WHERE id = 'Q_1771832119895_OOZJE8P';

UPDATE public.questions
SET
  content = content || $graph_online_note$

(Khi làm bài trực tuyến, có thể trình bày bảng biến thiên và mô tả đầy đủ đồ thị bằng các điểm đặc biệt, chiều biến thiên hoặc mã TikZ/LaTeX có thể kiểm tra.)
$graph_online_note$,
  updated_at = now()
WHERE id = 'Q_1784633634868_2RH17R6';

UPDATE public.questions
SET
  content = replace(
    content,
    '$s$ là quãng đường vật đi được trong khoảng thời gian đó.',
    '$s$ là tọa độ của vật trên một trục chuyển động tại thời điểm $t$.'
  ),
  updated_at = now()
WHERE id = 'Q_1784633634873_2XVUW0R';

UPDATE public.questions
SET
  solution = $wall_solution$
# Lời giải tham chiếu

Chọn hệ trục tọa độ với $A(0,0)$, $AC$ nằm trên trục $Ox$. Khi đó
$C(4,0)$, $E(4,3{,}5)$ và điểm của cạnh cong nằm thẳng đứng phía trên
trung điểm $M$ có tọa độ $(2,1)$.

Vì trục của parabol vuông góc với mặt đất, đặt
$$y=ax^2+bx+c.$$
Parabol đi qua $(0,0)$, $(2,1)$ và $(4,3{,}5)$ nên
$$c=0,\qquad 4a+2b=1,\qquad 16a+4b=3{,}5.$$
Suy ra $a=\dfrac{3}{16}$ và $b=\dfrac18$. Do đó
$$y=\frac{3}{16}x^2+\frac18x.$$

Diện tích thiết diện cong là
$$
S=\int_0^4\left(\frac{3}{16}x^2+\frac18x\right)\,dx
=\left[\frac{x^3}{16}+\frac{x^2}{16}\right]_0^4
=5\ \text{m}^2.
$$

Theo mô hình khối tường có thiết diện không đổi dọc theo $AB=4$ m,
thể tích bê tông cần dùng là
$$V=S\cdot AB=5\cdot4=20\ \text{m}^3.$$
$wall_solution$,
  updated_at = now()
WHERE id = 'Q_1771832119895_OOZJE8P';

WITH grading_seed(question_id, reference_answer, rubric) AS (
  VALUES
    (
      'Q_1771832119893_8ZJSD0J'::text,
      $reference_q1$
Khai triển
$(3-5x)(x+1)=-5x^2-2x+3$.
Một nguyên hàm là
$-\dfrac53x^3-x^2+3x$.
Vì vậy
$$
\int_0^1(3-5x)(x+1)\,dx
=\left[-\frac53x^3-x^2+3x\right]_0^1
=\frac13.
$$
Chấp nhận mọi cách biến đổi hoặc tính tích phân tương đương cho kết quả đúng.
$reference_q1$,
      $rubric_q1$
[
  {
    "criterion_id": "expand_integrand",
    "title": "Biến đổi biểu thức",
    "description": "Khai triển đúng tích thành -5x^2 - 2x + 3 hoặc dùng một cách biến đổi tương đương.",
    "max_score": 0.25
  },
  {
    "criterion_id": "antiderivative",
    "title": "Tìm nguyên hàm",
    "description": "Tìm đúng một nguyên hàm của biểu thức dưới dấu tích phân.",
    "max_score": 0.25
  },
  {
    "criterion_id": "apply_bounds",
    "title": "Áp dụng cận tích phân",
    "description": "Thực hiện đúng hiệu F(1)-F(0) hoặc một phép tính cận tương đương.",
    "max_score": 0.25
  },
  {
    "criterion_id": "integral_conclusion",
    "title": "Kết quả và kết luận",
    "description": "Kết luận giá trị tích phân bằng 1/3. Nếu chỉ có đáp số mà không có lời giải thì chỉ đạt tiêu chí này.",
    "max_score": 0.25
  }
]
$rubric_q1$::jsonb
    ),
    (
      'Q_1771832119894_DIPQPB5'::text,
      $reference_q2$
Ta có
$$
F'(x)=e^x\left[ax^2+(2a+b)x+(b+c)\right].
$$
Do $F'(x)=(x^2+1)e^x$, đồng nhất hệ số cho
$$a=1,\qquad 2a+b=0,\qquad b+c=1.$$
Suy ra $a=1$, $b=-2$, $c=3$ và
$$S=a+b+c=2.$$
$reference_q2$,
      $rubric_q2$
[
  {
    "criterion_id": "differentiate_f",
    "title": "Tính đạo hàm F",
    "description": "Áp dụng đúng quy tắc đạo hàm tích và thu được F'(x)=e^x[ax^2+(2a+b)x+(b+c)].",
    "max_score": 0.25
  },
  {
    "criterion_id": "match_coefficients",
    "title": "Đồng nhất hệ số",
    "description": "Lập đúng các phương trình a=1, 2a+b=0 và b+c=1.",
    "max_score": 0.25
  },
  {
    "criterion_id": "solve_coefficients",
    "title": "Giải các hệ số",
    "description": "Giải đúng a=1, b=-2, c=3; có thể cho điểm phần này theo số hệ số tìm đúng.",
    "max_score": 0.25
  },
  {
    "criterion_id": "sum_coefficients",
    "title": "Tính tổng và kết luận",
    "description": "Tính và kết luận đúng S=a+b+c=2.",
    "max_score": 0.25
  }
]
$rubric_q2$::jsonb
    ),
    (
      'Q_1771832119895_OOZJE8P'::text,
      $reference_q3$
Chọn $A(0,0)$, $C(4,0)$, $E(4,3{,}5)$; điểm của parabol phía trên
trung điểm $M$ là $(2,1)$. Đặt $y=ax^2+bx+c$. Từ ba điểm trên suy ra
$$c=0,\qquad a=\frac{3}{16},\qquad b=\frac18,$$
nên $y=\dfrac{3}{16}x^2+\dfrac18x$.

Diện tích thiết diện là
$$
S=\int_0^4\left(\frac{3}{16}x^2+\frac18x\right)dx=5\ \text{m}^2.
$$
Theo mô hình thiết diện không đổi dọc $AB=4$ m,
$$V=S\cdot AB=5\cdot4=20\ \text{m}^3.$$
$reference_q3$,
      $rubric_q3$
[
  {
    "criterion_id": "coordinate_model",
    "title": "Mô hình tọa độ",
    "description": "Chọn hệ trục hợp lý và xác định đúng ba điểm của parabol: (0,0), (2,1), (4,3.5), hoặc một hệ tọa độ tương đương.",
    "max_score": 0.25
  },
  {
    "criterion_id": "parabola_equation",
    "title": "Phương trình parabol",
    "description": "Thiết lập và tìm đúng phương trình y=3x^2/16+x/8 trong hệ trục đã chọn, hoặc phương trình tương đương.",
    "max_score": 0.25
  },
  {
    "criterion_id": "cross_section_area",
    "title": "Diện tích thiết diện",
    "description": "Lập đúng tích phân trên đoạn dài 4 m và tính được diện tích thiết diện bằng 5 m^2.",
    "max_score": 0.25
  },
  {
    "criterion_id": "wall_volume",
    "title": "Thể tích khối tường",
    "description": "Theo giả thiết thiết diện không đổi, nhân diện tích với AB=4 m và kết luận V=20 m^3, kèm đơn vị đúng. Nếu học sinh phản biện dữ kiện hình học chưa đủ rõ thì chuyển giáo viên xem lại thay vì tự chấm 0.",
    "max_score": 0.25
  }
]
$rubric_q3$::jsonb
    ),
    (
      'Q_1784633634868_2RH17R6'::text,
      $reference_q4$
Tập xác định là $\mathbb R$. Ta có
$$y'=-3x^2+6x=-3x(x-2).$$
Do đó hàm số nghịch biến trên $(-\infty,0)$, đồng biến trên $(0,2)$
và nghịch biến trên $(2,+\infty)$. Hàm đạt cực tiểu tại $(0,-4)$ và
cực đại tại $(2,0)$. Ngoài ra
$$\lim_{x\to-\infty}y=+\infty,\qquad
\lim_{x\to+\infty}y=-\infty.$$

Vì $y''=-6x+6$, đồ thị có điểm uốn $(1,-2)$. Ta cũng có
$y=-(x+1)(x-2)^2$, nên đồ thị cắt trục $Ox$ tại $(-1,0)$, tiếp xúc
trục $Ox$ tại $(2,0)$ và cắt trục $Oy$ tại $(0,-4)$. Đồ thị phải thể
hiện đúng các khoảng biến thiên, hai cực trị, điểm uốn và chiều đi ở vô cực.
$reference_q4$,
      $rubric_q4$
[
  {
    "criterion_id": "domain_limits",
    "title": "Tập xác định và giới hạn",
    "description": "Nêu đúng tập xác định R và hai giới hạn của hàm số tại âm vô cực, dương vô cực.",
    "max_score": 0.25
  },
  {
    "criterion_id": "derivative_critical_points",
    "title": "Đạo hàm và điểm tới hạn",
    "description": "Tính đúng y'=-3x(x-2) và tìm đúng các điểm tới hạn x=0, x=2.",
    "max_score": 0.25
  },
  {
    "criterion_id": "variation_extrema",
    "title": "Đơn điệu và cực trị",
    "description": "Xét đúng dấu đạo hàm, các khoảng tăng giảm và xác định đúng cực tiểu (0,-4), cực đại (2,0).",
    "max_score": 0.25
  },
  {
    "criterion_id": "variation_table",
    "title": "Bảng biến thiên",
    "description": "Lập hoặc mô tả đầy đủ bảng biến thiên, đúng chiều và đúng các giá trị cực trị.",
    "max_score": 0.25
  },
  {
    "criterion_id": "inflection_key_points",
    "title": "Điểm uốn và điểm đặc biệt",
    "description": "Tìm đúng điểm uốn (1,-2) và các giao điểm hoặc điểm đặc biệt cần thiết để vẽ đồ thị.",
    "max_score": 0.25
  },
  {
    "criterion_id": "graph",
    "title": "Đồ thị",
    "description": "Vẽ, mô tả hoặc cung cấp mã biểu diễn đồ thị đúng hình dạng, chiều biến thiên và các điểm đặc biệt. Nếu hình vẽ không có trong phần văn bản gửi cho AI thì tiêu chí này cần giáo viên kiểm tra thủ công.",
    "max_score": 0.25
  }
]
$rubric_q4$::jsonb
    ),
    (
      'Q_1784633634869_87EILC8'::text,
      $reference_q5$
Ta có
$$y'=-4x^3+8x=-4x(x^2-2).$$
Các điểm cần xét trên $[-1,4]$ là hai đầu mút $-1$, $4$ và các điểm
tới hạn thuộc đoạn là $0$, $\sqrt2$; nghiệm $-\sqrt2$ không thuộc đoạn.
Tính được
$$
y(-1)=9,\qquad y(0)=6,\qquad y(\sqrt2)=10,\qquad y(4)=-186.
$$
Vậy giá trị lớn nhất là $10$ tại $x=\sqrt2$ và giá trị nhỏ nhất là
$-186$ tại $x=4$.
$reference_q5$,
      $rubric_q5$
[
  {
    "criterion_id": "derivative",
    "title": "Tính đạo hàm",
    "description": "Tính đúng y'=-4x^3+8x và phân tích được phương trình y'=0.",
    "max_score": 0.25
  },
  {
    "criterion_id": "critical_points",
    "title": "Chọn các điểm cần xét",
    "description": "Tìm đúng x=0, x=±sqrt(2), loại -sqrt(2) khỏi đoạn và xét đủ hai đầu mút.",
    "max_score": 0.25
  },
  {
    "criterion_id": "candidate_values",
    "title": "Tính các giá trị ứng viên",
    "description": "Tính đúng y(-1)=9, y(0)=6, y(sqrt(2))=10 và y(4)=-186.",
    "max_score": 0.25
  },
  {
    "criterion_id": "extrema_conclusion",
    "title": "Kết luận giá trị lớn nhất, nhỏ nhất",
    "description": "Kết luận đúng giá trị lớn nhất 10 tại x=sqrt(2) và giá trị nhỏ nhất -186 tại x=4.",
    "max_score": 0.25
  }
]
$rubric_q5$::jsonb
    ),
    (
      'Q_1784633634873_2XVUW0R'::text,
      $reference_q6$
Vận tốc là đạo hàm của tọa độ theo thời gian:
$$v(t)=s'(t)=-6t^2+48t+9.$$
Thay $t=4$:
$$v(4)=-6\cdot4^2+48\cdot4+9=105.$$
Vậy vận tốc của vật lúc $t=4$ bằng $105$ đơn vị vận tốc.
$reference_q6$,
      $rubric_q6$
[
  {
    "criterion_id": "velocity_function",
    "title": "Lập hàm vận tốc",
    "description": "Nhận ra v=s' và tính đúng v(t)=-6t^2+48t+9.",
    "max_score": 0.25
  },
  {
    "criterion_id": "evaluate_velocity",
    "title": "Thay thời điểm và kết luận",
    "description": "Thay đúng t=4, tính và kết luận vận tốc bằng 105.",
    "max_score": 0.25
  }
]
$rubric_q6$::jsonb
    )
)
INSERT INTO public.question_grading_configs (
  question_id,
  reference_answer,
  rubric,
  rubric_version,
  minimum_confidence,
  ai_enabled,
  created_by
)
SELECT
  grading_seed.question_id,
  btrim(grading_seed.reference_answer),
  grading_seed.rubric,
  1,
  0.75,
  true,
  NULL
FROM grading_seed;

-- Replace the two legacy marking guides whose row scores summed above the
-- declared question maximum. The grading config is now the scoring authority.
UPDATE public.questions question_row
SET
  solution = grading_config.reference_answer,
  updated_at = now()
FROM public.question_grading_configs grading_config
WHERE grading_config.question_id = question_row.id
  AND question_row.id IN (
    'Q_1784633634868_2RH17R6',
    'Q_1784633634869_87EILC8'
  );

DO $verify$
DECLARE
  v_question_ids text[] := ARRAY[
    'Q_1771832119893_8ZJSD0J',
    'Q_1771832119894_DIPQPB5',
    'Q_1771832119895_OOZJE8P',
    'Q_1784633634868_2RH17R6',
    'Q_1784633634869_87EILC8',
    'Q_1784633634873_2XVUW0R'
  ];
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.question_grading_configs grading_config
    WHERE grading_config.question_id = ANY(v_question_ids)
  ) <> 6 THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONFIG_COUNT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_grading_configs grading_config
    WHERE grading_config.question_id = ANY(v_question_ids)
      AND CASE
        WHEN jsonb_typeof(grading_config.rubric) = 'array'
          THEN jsonb_array_length(grading_config.rubric) = 0
        ELSE true
      END
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_RUBRIC_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_grading_configs grading_config
    JOIN public.questions question_row
      ON question_row.id = grading_config.question_id
    CROSS JOIN LATERAL jsonb_array_elements(grading_config.rubric) criterion
    WHERE grading_config.question_id = ANY(v_question_ids)
    GROUP BY grading_config.question_id, question_row.essay_max_score
    HAVING COUNT(*) <> COUNT(DISTINCT criterion ->> 'criterion_id')
       OR abs(
         SUM((criterion ->> 'max_score')::numeric)
         - question_row.essay_max_score
       ) > 0.0001
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_RUBRIC_TOTAL_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    JOIN (
      VALUES
        ('Q_1771832119893_8ZJSD0J'::text, 1::numeric),
        ('Q_1771832119894_DIPQPB5'::text, 1::numeric),
        ('Q_1771832119895_OOZJE8P'::text, 1::numeric),
        ('Q_1784633634868_2RH17R6'::text, 1.5::numeric),
        ('Q_1784633634869_87EILC8'::text, 1::numeric),
        ('Q_1784633634873_2XVUW0R'::text, 0.5::numeric)
    ) expected(question_id, max_score)
      ON expected.question_id = question_row.id
    WHERE question_row.essay_max_score IS DISTINCT FROM expected.max_score
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_SCORE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1771832119895_OOZJE8P'
      AND NULLIF(btrim(question_row.solution), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'CURVED_WALL_SOLUTION_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    JOIN public.question_grading_configs grading_config
      ON grading_config.question_id = question_row.id
    WHERE question_row.id IN (
      'Q_1784633634868_2RH17R6',
      'Q_1784633634869_87EILC8'
    )
      AND question_row.solution IS DISTINCT FROM grading_config.reference_answer
  ) THEN
    RAISE EXCEPTION 'LEGACY_MARKING_GUIDE_REPAIR_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1771832119895_OOZJE8P'
      AND position(
        'thiết diện vuông góc với $AB$ không đổi'
        IN question_row.content
      ) = 0
  ) OR EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1784633634868_2RH17R6'
      AND position('Khi làm bài trực tuyến' IN question_row.content) = 0
  ) OR EXISTS (
    SELECT 1
    FROM public.questions question_row
    WHERE question_row.id = 'Q_1784633634873_2XVUW0R'
      AND (
        position('$s$ là tọa độ của vật' IN question_row.content) = 0
        OR position('$s$ là quãng đường vật đi được' IN question_row.content) > 0
      )
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONTENT_REPAIR_MISMATCH';
  END IF;
END;
$verify$;

COMMIT;

-- Rollback is intentionally separate and must only be used before any of these
-- questions is linked or answered: ../rollback/20260723_essay_legacy_config_backfill.sql
