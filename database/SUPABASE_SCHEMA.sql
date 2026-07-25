-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.questions (
  id text NOT NULL,
  content text NOT NULL,
  question_type text DEFAULT 'multiple_choice'::text,
  difficulty integer DEFAULT 1,
  cognitive_level text,
  source_exam text,
  explanation text,
  solution text,
  tikz_code text,
  tikz_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  solution_tikz_code text,
  solution_tikz_image_url text,
  solution_tikz_code_2 text,
  solution_tikz_image_url_2 text,
  CONSTRAINT questions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.answers (
  id text NOT NULL,
  question_id text NOT NULL,
  content text NOT NULL,
  is_correct boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT answers_pkey PRIMARY KEY (id),
  CONSTRAINT answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.tags (
  id text NOT NULL,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tags_pkey PRIMARY KEY (id)
);
CREATE TABLE public.question_tags (
  question_id text NOT NULL,
  tag_id text NOT NULL,
  CONSTRAINT question_tags_pkey PRIMARY KEY (question_id, tag_id),
  CONSTRAINT question_tags_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT question_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id)
);
CREATE TABLE public.topics (
  id text NOT NULL,
  name text NOT NULL,
  description text,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT topics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categories (
  id text NOT NULL,
  topic_id text NOT NULL,
  name text NOT NULL,
  description text,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.sections (
  id text NOT NULL,
  category_id text NOT NULL,
  topic_id text NOT NULL,
  name text NOT NULL,
  description text,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sections_pkey PRIMARY KEY (id),
  CONSTRAINT sections_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT sections_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.subsections (
  id text NOT NULL,
  section_id text NOT NULL,
  category_id text NOT NULL,
  topic_id text NOT NULL,
  name text NOT NULL,
  description text,
  order_index integer DEFAULT 0,
  question_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subsections_pkey PRIMARY KEY (id),
  CONSTRAINT subsections_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT subsections_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT subsections_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.question_taxonomy (
  question_id text NOT NULL,
  topic_id text,
  category_id text,
  section_id text,
  subsection_id text,
  CONSTRAINT question_taxonomy_pkey PRIMARY KEY (question_id),
  CONSTRAINT question_taxonomy_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT question_taxonomy_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id),
  CONSTRAINT question_taxonomy_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT question_taxonomy_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT question_taxonomy_subsection_id_fkey FOREIGN KEY (subsection_id) REFERENCES public.subsections(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  email text UNIQUE,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'student'::text])),
  class_id text,
  school text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  grade integer CHECK (grade = ANY (ARRAY[10, 11, 12])),
  access_tier text NOT NULL DEFAULT 'basic'::text CHECK (access_tier = ANY (ARRAY['basic'::text, 'full'::text])),
  must_change_password boolean NOT NULL DEFAULT false,
  source_enrollment_id uuid,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.classes (
  id text NOT NULL,
  name text NOT NULL,
  grade integer CHECK (grade = ANY (ARRAY[10, 11, 12])),
  school text,
  teacher_id uuid,
  student_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT classes_pkey PRIMARY KEY (id),
  CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.exams (
  id text NOT NULL,
  title text NOT NULL,
  description text,
  source_exam text,
  duration integer NOT NULL,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  is_shuffle_questions boolean DEFAULT false,
  is_shuffle_answers boolean DEFAULT false,
  show_results_immediately boolean DEFAULT false,
  allow_review boolean DEFAULT true,
  max_attempts integer DEFAULT 1,
  allow_dev_tools boolean DEFAULT false,
  allow_tab_switch boolean DEFAULT false,
  max_tab_switches integer DEFAULT 0,
  require_webcam boolean DEFAULT false,
  passing_score numeric DEFAULT 5.0,
  total_score numeric DEFAULT 10.0,
  created_by uuid,
  class_id text,
  is_published boolean DEFAULT false,
  subject text,
  exam_type text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  grade integer CHECK (grade = ANY (ARRAY[10, 11, 12])),
  exam_mode text DEFAULT 'simulation'::text CHECK (exam_mode = ANY (ARRAY['practice'::text, 'simulation'::text, 'homework'::text])),
  session_size integer NOT NULL DEFAULT 10,
  CONSTRAINT exams_pkey PRIMARY KEY (id),
  CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT exams_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE TABLE public.exam_questions (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  exam_id text NOT NULL,
  question_id text NOT NULL,
  question_type text NOT NULL CHECK (question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'short_answer'::text])),
  score numeric DEFAULT 1.0,
  part_number integer NOT NULL CHECK (part_number = ANY (ARRAY[1, 2, 3])),
  order_in_part integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exam_questions_pkey PRIMARY KEY (id),
  CONSTRAINT exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT fk_exam_questions_question_id FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.exam_attempts (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  exam_id text NOT NULL,
  student_id uuid NOT NULL,
  start_time timestamp with time zone DEFAULT now(),
  submit_time timestamp with time zone,
  time_spent integer,
  score numeric,
  total_questions integer DEFAULT 0,
  correct_answers integer DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'graded'::text, 'abandoned'::text])),
  ip_address text,
  user_agent text,
  tab_switches integer DEFAULT 0,
  dev_tools_opened boolean DEFAULT false,
  suspicious_activities jsonb DEFAULT '[]'::jsonb,
  current_part integer DEFAULT 1,
  part_1_completed boolean DEFAULT false,
  part_2_completed boolean DEFAULT false,
  part_3_completed boolean DEFAULT false,
  attempt_number integer DEFAULT 1,
  is_flagged boolean DEFAULT false,
  flag_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  current_session_index integer NOT NULL DEFAULT 0,
  CONSTRAINT exam_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT exam_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.student_answers (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  attempt_id text NOT NULL,
  question_id text NOT NULL,
  question_type text NOT NULL CHECK (question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'short_answer'::text])),
  selected_answer text,
  selected_answers jsonb,
  text_answer text,
  is_correct boolean,
  score numeric,
  answered_at timestamp with time zone DEFAULT now(),
  time_spent integer,
  shown_feedback boolean NOT NULL DEFAULT false,
  CONSTRAINT student_answers_pkey PRIMARY KEY (id),
  CONSTRAINT student_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.exam_attempts(id),
  CONSTRAINT fk_student_answers_question_id FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.exam_analytics (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  exam_id text NOT NULL,
  question_id text NOT NULL,
  total_attempts integer DEFAULT 0,
  correct_count integer DEFAULT 0,
  incorrect_count integer DEFAULT 0,
  skip_count integer DEFAULT 0,
  difficulty_index numeric,
  discrimination_index numeric,
  avg_time_spent integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exam_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT exam_analytics_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.anti_cheat_logs (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  attempt_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['dev_tools_opened'::text, 'tab_switch'::text, 'window_blur'::text, 'right_click'::text, 'copy_paste'::text, 'network_request'::text, 'suspicious_timing'::text])),
  description text,
  details jsonb DEFAULT '{}'::jsonb,
  severity text CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT anti_cheat_logs_pkey PRIMARY KEY (id),
  CONSTRAINT anti_cheat_logs_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.exam_attempts(id)
);
CREATE TABLE public.question_feedbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id text NOT NULL,
  attempt_id text NOT NULL,
  student_id uuid NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'fixed'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT question_feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT fk_feedback_question FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT fk_feedback_attempt FOREIGN KEY (attempt_id) REFERENCES public.exam_attempts(id),
  CONSTRAINT fk_feedback_student FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.admin_otp_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_otp_codes_pkey PRIMARY KEY (id),
  CONSTRAINT admin_otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.site_settings (
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  type text DEFAULT 'info'::text CHECK (type = ANY (ARRAY['info'::text, 'warning'::text, 'update'::text, 'new_exam'::text])),
  link_url text,
  link_text text,
  is_active boolean DEFAULT true,
  is_pinned boolean DEFAULT false,
  start_date timestamp with time zone DEFAULT now(),
  end_date timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.question_bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT question_bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT question_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT question_bookmarks_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL,
  category text DEFAULT 'achievement'::text CHECK (category = ANY (ARRAY['achievement'::text, 'streak'::text, 'score'::text, 'milestone'::text])),
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL,
  points integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id)
);
CREATE TABLE public.user_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_type text NOT NULL CHECK (goal_type = ANY (ARRAY['avg_score'::text, 'exams_per_week'::text, 'streak_days'::text, 'total_exams'::text])),
  target_value numeric NOT NULL,
  current_value numeric DEFAULT 0,
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_goals_pkey PRIMARY KEY (id),
  CONSTRAINT user_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL DEFAULT ''::text,
  cover_image text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text])),
  author_id uuid,
  category text,
  published_at timestamp with time zone,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id)
);
CREATE TABLE public.enrollment_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  class text NOT NULL CHECK (class = ANY (ARRAY['Toán 10'::text, 'Toán 11'::text, 'Toán 12'::text, 'Tin học'::text])),
  status text NOT NULL DEFAULT 'new'::text CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'enrolled'::text, 'rejected'::text])),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  parent_name text,
  parent_phone text,
  user_notes text,
  CONSTRAINT enrollment_registrations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.theories (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  section_id text NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  content_md text,
  difficulty_level integer DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  order_index integer DEFAULT 0,
  is_published boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT theories_pkey PRIMARY KEY (id),
  CONSTRAINT theories_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id)
);
CREATE TABLE public.theory_edges (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  from_theory_id text NOT NULL,
  to_theory_id text NOT NULL,
  relation_type text NOT NULL CHECK (relation_type = ANY (ARRAY['prerequisite'::text, 'related'::text, 'extension'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT theory_edges_pkey PRIMARY KEY (id),
  CONSTRAINT theory_edges_from_theory_id_fkey FOREIGN KEY (from_theory_id) REFERENCES public.theories(id),
  CONSTRAINT theory_edges_to_theory_id_fkey FOREIGN KEY (to_theory_id) REFERENCES public.theories(id)
);
CREATE TABLE public.question_theories (
  question_id text NOT NULL,
  theory_id text NOT NULL,
  weight numeric DEFAULT 1.0,
  CONSTRAINT question_theories_pkey PRIMARY KEY (question_id, theory_id),
  CONSTRAINT question_theories_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT question_theories_theory_id_fkey FOREIGN KEY (theory_id) REFERENCES public.theories(id)
);
CREATE TABLE public.theory_mastery (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  student_id uuid NOT NULL,
  theory_id text NOT NULL,
  mastery_score numeric DEFAULT 0.0,
  questions_attempted integer DEFAULT 0,
  questions_correct integer DEFAULT 0,
  last_attempt_at timestamp with time zone,
  streak integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT theory_mastery_pkey PRIMARY KEY (id),
  CONSTRAINT theory_mastery_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id),
  CONSTRAINT theory_mastery_theory_id_fkey FOREIGN KEY (theory_id) REFERENCES public.theories(id)
);
CREATE TABLE public.latex_templates (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  template_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT latex_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.knowledge_blocks (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  theory_id text NOT NULL,
  block_type text NOT NULL CHECK (block_type = ANY (ARRAY['dinh_nghia'::text, 'dinh_ly'::text, 'tinh_chat'::text, 'he_qua'::text, 'cong_thuc'::text, 'phuong_phap'::text, 'chu_y'::text, 'vi_du'::text, 'bai_tap'::text])),
  title text,
  body_md text,
  order_index integer DEFAULT 0,
  external_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cognitive_level text CHECK (cognitive_level = ANY (ARRAY['NB'::text, 'TH'::text, 'VD'::text, 'VDC'::text])),
  CONSTRAINT knowledge_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_blocks_theory_id_fkey FOREIGN KEY (theory_id) REFERENCES public.theories(id)
);
CREATE TABLE public.knowledge_block_edges (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  from_block_id text NOT NULL,
  to_block_id text NOT NULL,
  relation_type text NOT NULL CHECK (relation_type = ANY (ARRAY['prerequisite'::text, 'related'::text, 'extension'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT knowledge_block_edges_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_block_edges_to_block_id_fkey FOREIGN KEY (to_block_id) REFERENCES public.knowledge_blocks(id),
  CONSTRAINT knowledge_block_edges_from_block_id_fkey FOREIGN KEY (from_block_id) REFERENCES public.knowledge_blocks(id)
);
CREATE TABLE public.theory_mastery_by_level (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  student_id uuid NOT NULL,
  theory_id text NOT NULL,
  cognitive_level text NOT NULL CHECK (cognitive_level = ANY (ARRAY['NB'::text, 'TH'::text, 'VD'::text, 'VDC'::text])),
  questions_attempted integer DEFAULT 0,
  questions_correct integer DEFAULT 0,
  mastery_score numeric DEFAULT 0.0,
  last_attempt_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT theory_mastery_by_level_pkey PRIMARY KEY (id),
  CONSTRAINT theory_mastery_by_level_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id),
  CONSTRAINT theory_mastery_by_level_theory_id_fkey FOREIGN KEY (theory_id) REFERENCES public.theories(id)
);
CREATE TABLE public.exam_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exam_id text NOT NULL,
  class_id text,
  student_id uuid,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exam_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT exam_assignments_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT exam_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT exam_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id),
  CONSTRAINT exam_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id)
);