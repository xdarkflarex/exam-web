/**
 * Mức nhận thức (cognitive level) dùng chung toàn hệ thống.
 * NB  = Nhận biết
 * TH  = Thông hiểu
 * VD  = Vận dụng
 * VDC = Vận dụng cao
 */
export type CognitiveLevel = 'NB' | 'TH' | 'VD' | 'VDC'

export const COGNITIVE_LEVELS: CognitiveLevel[] = ['NB', 'TH', 'VD', 'VDC']

export const COGNITIVE_LABELS: Record<CognitiveLevel, string> = {
  NB: 'Nhận biết',
  TH: 'Thông hiểu',
  VD: 'Vận dụng',
  VDC: 'Vận dụng cao',
}

export const COGNITIVE_COLORS: Record<CognitiveLevel, string> = {
  NB: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  TH: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  VD: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  VDC: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const DIFFICULTY_TO_LEVEL: Record<number, CognitiveLevel> = {
  1: 'NB',
  2: 'TH',
  3: 'VD',
  4: 'VDC',
}

/**
 * Suy ra mức nhận thức của một câu hỏi.
 * Ưu tiên cột cognitive_level (NB/TH/VD/VDC); nếu trống thì ánh xạ từ difficulty (1..4).
 */
export function resolveCognitiveLevel(
  cognitiveLevel: string | null | undefined,
  difficulty: number | null | undefined
): CognitiveLevel {
  if (cognitiveLevel && (COGNITIVE_LEVELS as string[]).includes(cognitiveLevel)) {
    return cognitiveLevel as CognitiveLevel
  }
  if (difficulty && DIFFICULTY_TO_LEVEL[difficulty]) {
    return DIFFICULTY_TO_LEVEL[difficulty]
  }
  return 'NB'
}
