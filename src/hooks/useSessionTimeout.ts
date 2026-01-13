'use client'

/**
 * useSessionTimeout Hook
 * 
 * Tracks user activity and enforces session timeouts.
 * Must be mounted at layout level for protected routes.
 * 
 * Features:
 * - Tracks mousemove, keydown, click, scroll, touchstart
 * - Idle timeout: admin=15min, student=30min
 * - Absolute session timeout: admin=6hours
 * - Auto logout when timeout exceeded
 */

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ACTIVITY_EVENTS,
  ACTIVITY_THROTTLE_MS,
  TIMEOUT_CHECK_INTERVAL_MS,
} from '@/lib/session/constants'
import {
  UserRole,
  updateLastActiveAt,
  getLastActiveAt,
  getSessionStartAt,
  initSessionStart,
  setStoredRole,
  clearSessionData,
  shouldTerminateSession,
  getRemainingIdleTime,
} from '@/lib/session/utils'

interface UseSessionTimeoutOptions {
  role: UserRole
  enabled?: boolean
}

export function useSessionTimeout({ role, enabled = true }: UseSessionTimeoutOptions) {
  const router = useRouter()
  const supabase = createClient()
  
  // Refs for cleanup
  const lastActivityRef = useRef<number>(Date.now())
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isLoggingOutRef = useRef(false)

  /**
   * Perform logout and redirect
   */
  const performLogout = useCallback(async (reason: 'idle' | 'absolute') => {
    // Prevent multiple logout attempts
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    // Clear session data first
    clearSessionData()

    // Sign out from Supabase
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Logout error:', error)
    }

    // Redirect to login with reason parameter
    const message = reason === 'idle' 
      ? 'Phiên đăng nhập đã hết hạn do không hoạt động'
      : 'Phiên đăng nhập đã hết hạn'
    
    router.push(`/login?expired=true&reason=${reason}`)
  }, [router, supabase.auth])

  /**
   * Handle user activity - update last active timestamp
   */
  const handleActivity = useCallback(() => {
    const now = Date.now()
    
    // Throttle updates to prevent excessive localStorage writes
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) {
      return
    }
    
    lastActivityRef.current = now
    updateLastActiveAt()
  }, [])

  /**
   * Check if session should be terminated
   */
  const checkTimeout = useCallback(() => {
    const lastActiveAt = getLastActiveAt()
    const sessionStartAt = getSessionStartAt()
    
    const { shouldTerminate, reason } = shouldTerminateSession(
      lastActiveAt,
      sessionStartAt,
      role
    )

    if (shouldTerminate && reason) {
      performLogout(reason)
    }
  }, [role, performLogout])

  /**
   * Initialize session tracking
   */
  useEffect(() => {
    if (!enabled) return

    // Initialize session data
    initSessionStart()
    setStoredRole(role)
    updateLastActiveAt()

    // Add activity event listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Start timeout check interval
    checkIntervalRef.current = setInterval(checkTimeout, TIMEOUT_CHECK_INTERVAL_MS)

    // Run initial check
    checkTimeout()

    // Cleanup
    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [enabled, role, handleActivity, checkTimeout])

  /**
   * Handle visibility change (tab focus)
   * Check timeout when user returns to tab
   */
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // User returned to tab - check if session expired while away
        checkTimeout()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, checkTimeout])

  /**
   * Handle beforeunload - update activity on page leave
   */
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = () => {
      updateLastActiveAt()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [enabled])

  // Return utility for components that need remaining time
  return {
    getRemainingTime: () => getRemainingIdleTime(getLastActiveAt(), role),
    forceLogout: (reason: 'idle' | 'absolute' = 'idle') => performLogout(reason),
  }
}

export default useSessionTimeout
