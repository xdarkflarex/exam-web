/**
 * Session Timeout Utility Functions
 * 
 * Pure functions for session timeout calculations.
 * Can be used in both client and server (middleware) contexts.
 */

import { IDLE_TIMEOUT, ABSOLUTE_SESSION_TIMEOUT, STORAGE_KEYS } from './constants'

export type UserRole = 'admin' | 'student'

/**
 * Get idle timeout duration for a given role
 */
export function getIdleTimeout(role: UserRole): number {
  return IDLE_TIMEOUT[role] ?? IDLE_TIMEOUT.student
}

/**
 * Get absolute session timeout for a given role
 * Returns null if no absolute timeout is configured
 */
export function getAbsoluteSessionTimeout(role: UserRole): number | null {
  return ABSOLUTE_SESSION_TIMEOUT[role] ?? null
}

/**
 * Check if idle timeout has been exceeded
 * @param lastActiveAt - timestamp in milliseconds
 * @param role - user role
 * @returns true if timeout exceeded
 */
export function isIdleTimeoutExceeded(lastActiveAt: number | null, role: UserRole): boolean {
  if (lastActiveAt === null) return false
  
  const timeout = getIdleTimeout(role)
  const now = Date.now()
  const elapsed = now - lastActiveAt
  
  return elapsed > timeout
}

/**
 * Check if absolute session timeout has been exceeded (admin only)
 * @param sessionStartAt - timestamp in milliseconds
 * @param role - user role
 * @returns true if timeout exceeded
 */
export function isAbsoluteTimeoutExceeded(sessionStartAt: number | null, role: UserRole): boolean {
  const timeout = getAbsoluteSessionTimeout(role)
  
  // No absolute timeout configured for this role
  if (timeout === null) return false
  if (sessionStartAt === null) return false
  
  const now = Date.now()
  const elapsed = now - sessionStartAt
  
  return elapsed > timeout
}

/**
 * Check if session should be terminated (either timeout exceeded)
 */
export function shouldTerminateSession(
  lastActiveAt: number | null,
  sessionStartAt: number | null,
  role: UserRole
): { shouldTerminate: boolean; reason: 'idle' | 'absolute' | null } {
  // Check absolute timeout first (admin only)
  if (isAbsoluteTimeoutExceeded(sessionStartAt, role)) {
    return { shouldTerminate: true, reason: 'absolute' }
  }
  
  // Check idle timeout
  if (isIdleTimeoutExceeded(lastActiveAt, role)) {
    return { shouldTerminate: true, reason: 'idle' }
  }
  
  return { shouldTerminate: false, reason: null }
}

/**
 * Get remaining time before idle timeout (in milliseconds)
 */
export function getRemainingIdleTime(lastActiveAt: number | null, role: UserRole): number {
  if (lastActiveAt === null) return getIdleTimeout(role)
  
  const timeout = getIdleTimeout(role)
  const elapsed = Date.now() - lastActiveAt
  const remaining = timeout - elapsed
  
  return Math.max(0, remaining)
}

/**
 * Format milliseconds to human-readable string (e.g., "5 phút")
 */
export function formatTimeRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours} giờ ${minutes % 60} phút`
  }
  if (minutes > 0) {
    return `${minutes} phút`
  }
  return `${seconds} giây`
}

// ============================================
// LocalStorage Helpers (Client-side only)
// ============================================

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Update last active timestamp in localStorage
 */
export function updateLastActiveAt(): void {
  if (!isBrowser()) return
  localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_AT, Date.now().toString())
}

/**
 * Get last active timestamp from localStorage
 */
export function getLastActiveAt(): number | null {
  if (!isBrowser()) return null
  const value = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_AT)
  return value ? parseInt(value, 10) : null
}

/**
 * Initialize session start timestamp (call on login)
 */
export function initSessionStart(): void {
  if (!isBrowser()) return
  // Only set if not already set (preserve across page reloads)
  if (!localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)) {
    localStorage.setItem(STORAGE_KEYS.SESSION_START_AT, Date.now().toString())
  }
}

/**
 * Get session start timestamp
 */
export function getSessionStartAt(): number | null {
  if (!isBrowser()) return null
  const value = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
  return value ? parseInt(value, 10) : null
}

/**
 * Store user role in localStorage
 */
export function setStoredRole(role: UserRole): void {
  if (!isBrowser()) return
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, role)
}

/**
 * Get stored user role
 */
export function getStoredRole(): UserRole | null {
  if (!isBrowser()) return null
  const value = localStorage.getItem(STORAGE_KEYS.USER_ROLE)
  return (value === 'admin' || value === 'student') ? value : null
}

/**
 * Clear all session data from localStorage (call on logout)
 */
export function clearSessionData(): void {
  if (!isBrowser()) return
  localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE_AT)
  localStorage.removeItem(STORAGE_KEYS.SESSION_START_AT)
  localStorage.removeItem(STORAGE_KEYS.USER_ROLE)
}
