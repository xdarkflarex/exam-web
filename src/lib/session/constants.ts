/**
 * Session Timeout Constants
 * 
 * Defines timeout durations for different user roles.
 * All values are in milliseconds.
 */

// Idle timeout: user inactive (no mouse/keyboard/scroll activity)
export const IDLE_TIMEOUT = {
  admin: 15 * 60 * 1000,    // 15 minutes
  student: 30 * 60 * 1000,  // 30 minutes
} as const

// Absolute session timeout: max session duration regardless of activity
export const ABSOLUTE_SESSION_TIMEOUT = {
  admin: 6 * 60 * 60 * 1000, // 6 hours
  student: null,              // No absolute timeout for students
} as const

/**
 * Dòng `site_settings` chứa cấu hình khu quản trị, và tên trường bật/tắt hết
 * hạn phiên của admin bên trong `value` của dòng đó.
 *
 * Dùng chung một chỗ vì BA nơi đọc nó: trang cài đặt, `SessionTimeoutProvider`
 * (chặn phía client) và `middleware` (chặn phía server). Gõ tay tên khoá ở ba
 * nơi là ba cơ hội để một nơi đọc trượt và im lặng quay về mặc định.
 */
export const ADMIN_SETTINGS_KEY = 'admin.settings'
export const ADMIN_SESSION_TIMEOUT_FIELD = 'adminSessionTimeout'

// LocalStorage keys
export const STORAGE_KEYS = {
  LAST_ACTIVE_AT: 'session_last_active_at',
  SESSION_START_AT: 'session_start_at',
  USER_ROLE: 'session_user_role',
} as const

// Activity events to track
export const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
] as const

// Throttle interval for activity updates (prevent excessive writes)
export const ACTIVITY_THROTTLE_MS = 1000 // 1 second

// Check interval for timeout detection
export const TIMEOUT_CHECK_INTERVAL_MS = 10 * 1000 // 10 seconds
