-- Read-only audit for account/profile alignment and access configuration.
-- Run in Supabase SQL Editor. This script does not change data.
-- Share only the aggregate/check result sets, not individual account records.

BEGIN TRANSACTION READ ONLY;

-- 1. Account inventory by role and access tier.
SELECT
  profile.role,
  profile.access_tier,
  COUNT(*) AS account_count,
  COUNT(*) FILTER (WHERE profile.class_id IS NOT NULL) AS assigned_to_class,
  COUNT(*) FILTER (WHERE profile.class_id IS NULL) AS without_class,
  COUNT(*) FILTER (WHERE auth_user.email_confirmed_at IS NOT NULL) AS email_confirmed,
  COUNT(*) FILTER (WHERE auth_user.banned_until IS NOT NULL AND auth_user.banned_until > now()) AS currently_banned,
  COUNT(*) FILTER (WHERE profile.must_change_password) AS must_change_password
FROM public.profiles profile
LEFT JOIN auth.users auth_user ON auth_user.id = profile.id
GROUP BY profile.role, profile.access_tier
ORDER BY profile.role, profile.access_tier;

-- 2. Student distribution by class. Uses COUNT(profiles), not classes.student_count.
SELECT
  COALESCE(class_row.id, '(no-class)') AS class_id,
  COALESCE(class_row.name, 'Chưa xếp lớp') AS class_name,
  COALESCE(class_row.grade, profile.grade) AS grade,
  profile.access_tier,
  COUNT(*) AS student_count
FROM public.profiles profile
LEFT JOIN public.classes class_row ON class_row.id = profile.class_id
WHERE profile.role = 'student'
GROUP BY
  COALESCE(class_row.id, '(no-class)'),
  COALESCE(class_row.name, 'Chưa xếp lớp'),
  COALESCE(class_row.grade, profile.grade),
  profile.access_tier
ORDER BY class_name, profile.access_tier;

-- 3. Current feature-flag payload. Absence is allowed because runtime has defaults.
SELECT key, value, updated_at
FROM public.site_settings
WHERE key = 'access.feature_flags';

-- 4. Integrity and access-contract checks. Every must_be_zero value should be 0.
WITH checks AS (
  SELECT
    'auth_users_without_profile'::text AS check_name,
    COUNT(*)::bigint AS must_be_zero
  FROM auth.users auth_user
  LEFT JOIN public.profiles profile ON profile.id = auth_user.id
  WHERE profile.id IS NULL

  UNION ALL

  SELECT
    'profiles_without_auth_user',
    COUNT(*)::bigint
  FROM public.profiles profile
  LEFT JOIN auth.users auth_user ON auth_user.id = profile.id
  WHERE auth_user.id IS NULL

  UNION ALL

  SELECT
    'profile_email_mismatch_auth_email',
    COUNT(*)::bigint
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.id
  WHERE lower(COALESCE(profile.email, '')) IS DISTINCT FROM lower(COALESCE(auth_user.email, ''))

  UNION ALL

  SELECT
    'duplicate_profile_email_case_insensitive',
    COUNT(*)::bigint
  FROM (
    SELECT lower(email)
    FROM public.profiles
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) duplicate_email

  UNION ALL

  SELECT
    'duplicate_auth_email_case_insensitive',
    COUNT(*)::bigint
  FROM (
    SELECT lower(email)
    FROM auth.users
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) duplicate_email

  UNION ALL

  SELECT
    'profiles_with_missing_identity_fields',
    COUNT(*)::bigint
  FROM public.profiles
  WHERE NULLIF(btrim(COALESCE(full_name, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(email, '')), '') IS NULL

  UNION ALL

  SELECT
    'profiles_outside_live_admin_student_domain',
    COUNT(*)::bigint
  FROM public.profiles
  WHERE role NOT IN ('admin', 'student')

  UNION ALL

  SELECT
    'profiles_with_invalid_access_tier',
    COUNT(*)::bigint
  FROM public.profiles
  WHERE access_tier NOT IN ('basic', 'full')

  UNION ALL

  SELECT
    'profiles_with_invalid_grade',
    COUNT(*)::bigint
  FROM public.profiles
  WHERE grade IS NOT NULL
    AND grade NOT IN (10, 11, 12)

  UNION ALL

  SELECT
    'classes_with_invalid_grade',
    COUNT(*)::bigint
  FROM public.classes
  WHERE grade IS NOT NULL
    AND grade NOT IN (10, 11, 12)

  UNION ALL

  SELECT
    'profiles_with_missing_class_reference',
    COUNT(*)::bigint
  FROM public.profiles profile
  LEFT JOIN public.classes class_row ON class_row.id = profile.class_id
  WHERE profile.class_id IS NOT NULL
    AND class_row.id IS NULL

  UNION ALL

  SELECT
    'profile_and_class_grade_mismatch',
    COUNT(*)::bigint
  FROM public.profiles profile
  JOIN public.classes class_row ON class_row.id = profile.class_id
  WHERE profile.grade IS NOT NULL
    AND class_row.grade IS NOT NULL
    AND profile.grade IS DISTINCT FROM class_row.grade

  UNION ALL

  SELECT
    'class_teacher_not_staff',
    COUNT(*)::bigint
  FROM public.classes class_row
  LEFT JOIN public.profiles teacher ON teacher.id = class_row.teacher_id
  WHERE class_row.teacher_id IS NOT NULL
    AND (teacher.id IS NULL OR teacher.role NOT IN ('admin', 'teacher'))

  UNION ALL

  SELECT
    'missing_system_admin',
    CASE WHEN EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE role = 'admin'
    ) THEN 0 ELSE 1 END::bigint

  UNION ALL

  SELECT
    'admin_with_unconfirmed_email',
    COUNT(*)::bigint
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.id
  WHERE profile.role = 'admin'
    AND auth_user.email_confirmed_at IS NULL

  UNION ALL

  SELECT
    'active_banned_admin',
    COUNT(*)::bigint
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.id
  WHERE profile.role = 'admin'
    AND auth_user.banned_until IS NOT NULL
    AND auth_user.banned_until > now()

  UNION ALL

  SELECT
    'duplicate_source_enrollment_id',
    COUNT(*)::bigint
  FROM (
    SELECT source_enrollment_id
    FROM public.profiles
    WHERE source_enrollment_id IS NOT NULL
    GROUP BY source_enrollment_id
    HAVING COUNT(*) > 1
  ) duplicate_enrollment

  UNION ALL

  SELECT
    'invalid_feature_flags_shape',
    COUNT(*)::bigint
  FROM public.site_settings setting
  WHERE setting.key = 'access.feature_flags'
    AND (
      jsonb_typeof(setting.value) <> 'object'
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(
          CASE
            WHEN jsonb_typeof(setting.value) = 'object' THEN setting.value
            ELSE '{}'::jsonb
          END
        ) flag
        WHERE flag.key NOT IN (
          'practice', 'simulation', 'theories', 'graph',
          'homework', 'history', 'analytics'
        )
          OR jsonb_typeof(flag.value) <> 'boolean'
      )
    )

  UNION ALL

  SELECT
    'duplicate_feature_flag_rows',
    GREATEST(COUNT(*) - 1, 0)::bigint
  FROM public.site_settings
  WHERE key = 'access.feature_flags'

  UNION ALL

  SELECT
    'profiles_rls_not_enabled',
    CASE WHEN class_row.relrowsecurity THEN 0 ELSE 1 END::bigint
  FROM pg_class class_row
  JOIN pg_namespace namespace ON namespace.oid = class_row.relnamespace
  WHERE namespace.nspname = 'public'
    AND class_row.relname = 'profiles'

  UNION ALL

  SELECT
    'missing_profile_security_trigger',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.profiles'::regclass
        AND trigger_row.tgname = 'trg_protect_profile_security_fields'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled <> 'D'
    ) THEN 0 ELSE 1 END::bigint

  UNION ALL

  SELECT
    'role_constraint_not_current_admin_student_domain',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.profiles'::regclass
        AND constraint_row.conname = 'profiles_role_check'
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid) ILIKE '%admin%'
        AND pg_get_constraintdef(constraint_row.oid) ILIKE '%student%'
        AND pg_get_constraintdef(constraint_row.oid) NOT ILIKE '%teacher%'
    ) THEN 0 ELSE 1 END::bigint
)
SELECT check_name, must_be_zero
FROM checks
ORDER BY check_name;

-- 5. Structural role contract. Current live baseline is admin/student.
-- Source still contains teacher branches; enabling teacher requires a separate
-- synchronized migration across middleware, APIs and all RLS domains.
SELECT
  constraint_row.conname AS constraint_name,
  pg_get_constraintdef(constraint_row.oid) AS definition
FROM pg_constraint constraint_row
WHERE constraint_row.conrelid = 'public.profiles'::regclass
  AND constraint_row.contype = 'c'
ORDER BY constraint_row.conname;

COMMIT;
