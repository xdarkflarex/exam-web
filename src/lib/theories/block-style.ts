// ==============================================
// Cấu hình màu / nhãn cho các khối tri thức + quan hệ
// Dùng chung cho đồ thị toàn cục và mindmap từng bài.
// ==============================================
import type { BlockType, EdgeRelationType } from '@/types/theories'

export interface BlockStyle {
  label: string
  color: string      // màu chủ đạo (hex)
  bg: string         // nền nhạt (Tailwind class)
  text: string       // chữ (Tailwind class)
  icon: string       // emoji ngắn
}

export const BLOCK_STYLES: Record<BlockType, BlockStyle> = {
  dinh_nghia: { label: 'Định nghĩa', color: '#2563EB', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', icon: '📘' },
  dinh_ly: { label: 'Định lý', color: '#7C3AED', bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', icon: '📐' },
  tinh_chat: { label: 'Tính chất', color: '#0891B2', bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-700 dark:text-cyan-300', icon: '🔧' },
  he_qua: { label: 'Hệ quả', color: '#0D9488', bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-700 dark:text-teal-300', icon: '↪️' },
  cong_thuc: { label: 'Công thức', color: '#B45309', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', icon: '🧮' },
  phuong_phap: { label: 'Phương pháp', color: '#15803D', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', icon: '🧭' },
  chu_y: { label: 'Chú ý', color: '#DC2626', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '⚠️' },
  vi_du: { label: 'Ví dụ', color: '#475569', bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300', icon: '📝' },
  bai_tap: { label: 'Bài tập', color: '#4F46E5', bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', icon: '✏️' },
}

export function getBlockStyle(type: BlockType): BlockStyle {
  return BLOCK_STYLES[type] || BLOCK_STYLES.vi_du
}

export interface RelationStyle {
  label: string
  color: string
  dashed: boolean
}

export const RELATION_STYLES: Record<EdgeRelationType, RelationStyle> = {
  prerequisite: { label: 'Tiên quyết', color: '#f59e0b', dashed: false },
  related: { label: 'Liên quan', color: '#94a3b8', dashed: true },
  extension: { label: 'Mở rộng', color: '#14b8a6', dashed: true },
}

export function getRelationStyle(rel: EdgeRelationType): RelationStyle {
  return RELATION_STYLES[rel] || RELATION_STYLES.related
}
