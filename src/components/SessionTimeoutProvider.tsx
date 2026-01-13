'use client'

/**
 * SessionTimeoutProvider
 * 
 * Wrapper component that initializes session timeout tracking.
 * Mount this at layout level for protected routes.
 * 
 * This component:
 * - Tracks user activity (mousemove, keydown, click, scroll)
 * - Syncs activity timestamps to both localStorage AND cookies
 * - Cookies allow middleware to enforce timeout server-side
 * - Auto-logout when idle or absolute timeout exceeded
 * 
 * EXAM-SAFE BEHAVIOR:
 * - Detects /student/exam/* routes
 * - SKIPS idle timeout check on exam routes
 * - Still updates last_active_at (for post-exam timeout tracking)
 * - Students are NEVER logged out during an exam
 */

import { useEffect, useRef, useCallback, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ACTIVITY_EVENTS,
  ACTIVITY_THROTTLE_MS,
  TIMEOUT_CHECK_INTERVAL_MS,
  STORAGE_KEYS,
} from '@/lib/session/constants'
import {
  UserRole,
  shouldTerminateSession,
  getIdleTimeout,
  getAbsoluteSessionTimeout,
} from '@/lib/session/utils'

interface SessionTimeoutProviderProps {
  children: ReactNode
  role: UserRole
}

// Cookie helper - set cookie with expiry
function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`
}

// Cookie helper - delete cookie
function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`
}

// Cookie helper - get cookie value
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

/**
 * Check if the current pathname is an exam-in-progress route.
 * Exam routes should NEVER trigger idle logout.
 */
function isExamRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname.startsWith('/student/exam')
}

export default function SessionTimeoutProvider({ 
  children, 
  role 
}: SessionTimeoutProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  
  const lastActivityRef = useRef<number>(Date.now())
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isLoggingOutRef = useRef(false)
  
  // Track if we're on an exam route - memoized to prevent unnecessary re-renders
  const isOnExamRoute = isExamRoute(pathname)

  /**
   * Sync timestamps to both localStorage and cookies
   */
  const syncTimestamps = useCallback((lastActiveAt: number, sessionStartAt: number) => {
    // Cookie max-age: slightly longer than max timeout to ensure middleware can check
    const maxAge = 24 * 60 * 60 // 24 hours in seconds
    
    // localStorage (for client-side checks)
    localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_AT, lastActiveAt.toString())
    localStorage.setItem(STORAGE_KEYS.SESSION_START_AT, sessionStartAt.toString())
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, role)
    
    // Cookies (for middleware enforcement)
    setCookie('session_last_active_at', lastActiveAt.toString(), maxAge)
    setCookie('session_start_at', sessionStartAt.toString(), maxAge)
  }, [role])

  /**
   * Clear all session data
   */
  const clearAllSessionData = useCallback(() => {
    // localStorage
    localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE_AT)
    localStorage.removeItem(STORAGE_KEYS.SESSION_START_AT)
    localStorage.removeItem(STORAGE_KEYS.USER_ROLE)
    
    // Cookies
    deleteCookie('session_last_active_at')
    deleteCookie('session_start_at')
  }, [])

  /**
   * Perform logout and redirect
   */
  const performLogout = useCallback(async (reason: 'idle' | 'absolute') => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    clearAllSessionData()

    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Session timeout logout error:', error)
    }

    router.push(`/login?expired=true&reason=${reason}`)
  }, [router, supabase.auth, clearAllSessionData])

  /**
   * Handle user activity
   */
  const handleActivity = useCallback(() => {
    const now = Date.now()
    
    // Throttle updates
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) {
      return
    }
    
    lastActivityRef.current = now
    
    // Get or initialize session start
    let sessionStartAt = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
    if (!sessionStartAt) {
      sessionStartAt = now.toString()
    }
    
    syncTimestamps(now, parseInt(sessionStartAt, 10))
  }, [syncTimestamps])

  /**
   * Check if session should be terminated
   * 
   * EXAM-SAFE: This check is SKIPPED when on exam routes.
   * Students should NEVER be logged out during an exam.
   */
  const checkTimeout = useCallback(() => {
    // ============================================
    // EXAM-SAFE: Skip idle timeout on exam routes
    // ============================================
    if (isOnExamRoute) {
      // On exam routes, only check absolute timeout for admin (students have no absolute timeout)
      if (role === 'admin') {
        const sessionStartAtStr = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
        if (sessionStartAtStr) {
          const sessionStartAt = parseInt(sessionStartAtStr, 10)
          const absoluteTimeout = getAbsoluteSessionTimeout(role)
          if (absoluteTimeout && Date.now() - sessionStartAt > absoluteTimeout) {
            performLogout('absolute')
          }
        }
      }
      // For students on exam routes: NO logout whatsoever
      return
    }
    
    // Non-exam routes: apply normal timeout logic
    const lastActiveAtStr = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_AT)
    const sessionStartAtStr = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
    
    const lastActiveAt = lastActiveAtStr ? parseInt(lastActiveAtStr, 10) : null
    const sessionStartAt = sessionStartAtStr ? parseInt(sessionStartAtStr, 10) : null

    const { shouldTerminate, reason } = shouldTerminateSession(
      lastActiveAt,
      sessionStartAt,
      role
    )

    if (shouldTerminate && reason) {
      performLogout(reason)
    }
  }, [role, performLogout, isOnExamRoute])

  /**
   * Initialize on mount
   */
  useEffect(() => {
    const now = Date.now()
    
    // Initialize session if not exists
    let sessionStartAt = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
    if (!sessionStartAt) {
      sessionStartAt = now.toString()
    }
    
    // Sync initial timestamps
    syncTimestamps(now, parseInt(sessionStartAt, 10))

    // Add activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Start timeout check interval
    checkIntervalRef.current = setInterval(checkTimeout, TIMEOUT_CHECK_INTERVAL_MS)

    // Initial check
    checkTimeout()

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [handleActivity, checkTimeout, syncTimestamps])

  /**
   * Check timeout when tab becomes visible
   * 
   * EXAM-SAFE: On exam routes, we skip the timeout check but still
   * update last_active_at when returning to tab.
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Always update activity when returning to tab
        handleActivity()
        
        // Only check timeout if NOT on exam route
        if (!isOnExamRoute) {
          checkTimeout()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [checkTimeout, handleActivity, isOnExamRoute])

  /**
   * Update activity on page unload
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      const now = Date.now()
      const sessionStartAtStr = localStorage.getItem(STORAGE_KEYS.SESSION_START_AT)
      if (sessionStartAtStr) {
        syncTimestamps(now, parseInt(sessionStartAtStr, 10))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [syncTimestamps])

  return <>{children}</>
}
