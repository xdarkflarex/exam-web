-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
  CONSTRAINT exam_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT exam_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
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
  CONSTRAINT exams_pkey PRIMARY KEY (id),
  CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT exams_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id)
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
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
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
CREATE TABLE public.question_tags (
  question_id text NOT NULL,
  tag_id text NOT NULL,
  CONSTRAINT question_tags_pkey PRIMARY KEY (question_id, tag_id),
  CONSTRAINT question_tags_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT question_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id)
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
CREATE TABLE public.site_settings (
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (key)
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
  CONSTRAINT student_answers_pkey PRIMARY KEY (id),
  CONSTRAINT student_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.exam_attempts(id),
  CONSTRAINT fk_student_answers_question_id FOREIGN KEY (question_id) REFERENCES public.questions(id)
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
CREATE TABLE public.tags (
  id text NOT NULL,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tags_pkey PRIMARY KEY (id)
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