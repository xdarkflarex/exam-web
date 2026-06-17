import { createClient } from '@/lib/supabase/client'

/**
 * Các tính năng có thể bật/tắt cho nhóm học sinh 'basic'.
 * HS 'full' (access_tier='full') luôn có toàn quyền.
 */
export type FeatureKey =
  | 'practice'
  | 'simulation'
  | 'theories'
  | 'graph'
  | 'homework'
  | 'history'
  | 'analytics'

export type FeatureFlags = Record<FeatureKey, boolean>

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  practice: true,
  simulation: false,
  theories: true,
  graph: false,
  homework: true,
  history: true,
  analytics: false,
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  practice: 'Ôn tập',
  simulation: 'Thi thử',
  theories: 'Lý thuyết',
  graph: 'Đồ thị tri thức',
  homework: 'Bài tập về nhà',
  history: 'Lịch sử làm bài',
  analytics: 'Thống kê cá nhân',
}

const SETTINGS_KEY = 'access.feature_flags'

/** Đọc feature flags từ site_settings (fallback về mặc định). */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const supabase = createClient()
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (data?.value && typeof data.value === 'object') {
    return { ...DEFAULT_FEATURE_FLAGS, ...(data.value as Partial<FeatureFlags>) }
  }
  return { ...DEFAULT_FEATURE_FLAGS }
}

/** Lưu feature flags (admin). */
export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('site_settings')
    .upsert(
      { key: SETTINGS_KEY, value: flags, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  if (error) throw error
}

/**
 * Kiểm tra một HS có được dùng tính năng hay không.
 * - access_tier='full' → luôn được phép.
 * - access_tier='basic' → theo feature flags.
 */
export function hasFeatureAccess(
  accessTier: string | null | undefined,
  feature: FeatureKey,
  flags: FeatureFlags
): boolean {
  if (accessTier === 'full') return true
  return !!flags[feature]
}

export interface MyStudent {
  id: string
  full_name: string | null
  email: string | null
  class_id: string | null
  access_tier: string | null
}

/**
 * "Học sinh của tôi đang dạy": HS thuộc các lớp có teacher_id = teacherId.
 */
export async function getMyStudents(teacherId: string): Promise<MyStudent[]> {
  const supabase = createClient()

  const { data: classes } = await supabase
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId)

  const classIds = (classes || []).map((c) => c.id)
  if (classIds.length === 0) return []

  const { data: students, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, class_id, access_tier')
    .eq('role', 'student')
    .in('class_id', classIds)
    .order('full_name')

  if (error) throw error
  return (students || []) as MyStudent[]
}
