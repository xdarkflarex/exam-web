'use client'

/**
 * useExamAntiCheat Hook
 * 
 * Tracks suspicious activity during exam sessions for anti-cheat purposes.
 * This hook is OBSERVATIONAL ONLY - it does NOT log the user out or prevent actions.
 * 
 * Tracked events:
 * - tab_switch: User switched to another tab (visibility change)
 * - window_blur: Browser window lost focus
 * - suspicious_timing: Extended inactivity during exam (but NO logout)
 * 
 * All events are logged to Supabase table: anti_cheat_logs
 * 
 * IMPORTANT:
 * - This hook should ONLY be used on exam pages (/student/exam/*)
 * - It does NOT interfere with the exam flow
 * - It does NOT log the user out
 * - It is for monitoring/analytics purposes only
 */

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// Anti-cheat event types
type AntiCheatEventType = 'tab_switch' | 'window_blur' | 'suspicious_timing'

// Suspicious timing threshold: no interaction for this duration triggers a log
const SUSPICIOUS_INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

// Throttle duplicate events (don't spam the database)
const EVENT_THROTTLE_MS = 2000 // 2 seconds between same event type

interface UseExamAntiCheatOptions {
  attemptId: string
  enabled?: boolean
}

interface AntiCheatEvent {
  type: AntiCheatEventType
  timestamp: number
  metadata?: Record<string, unknown>
}

export function useExamAntiCheat({ 
  attemptId, 
  enabled = true 
}: UseExamAntiCheatOptions) {
  const supabase = createClient()
  
  // Track last event timestamps to throttle
  const lastEventTimestamps = useRef<Record<AntiCheatEventType, number>>({
    tab_switch: 0,
    window_blur: 0,
    suspicious_timing: 0,
  })
  
  // Track last activity for suspicious timing detection
  const lastActivityRef = useRef<number>(Date.now())
  const inactivityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Count events for metadata
  const eventCountsRef = useRef<Record<AntiCheatEventType, number>>({
    tab_switch: 0,
    window_blur: 0,
    suspicious_timing: 0,
  })

  /**
   * Log an anti-cheat event to Supabase
   * Throttled to prevent database spam
   */
  const logEvent = useCallback(async (
    eventType: AntiCheatEventType,
    metadata?: Record<string, unknown>
  ) => {
    if (!enabled || !attemptId) return
    
    const now = Date.now()
    
    // Throttle: don't log same event type within threshold
    if (now - lastEventTimestamps.current[eventType] < EVENT_THROTTLE_MS) {
      return
    }
    
    lastEventTimestamps.current[eventType] = now
    eventCountsRef.current[eventType]++
    
    try {
      await supabase.from('anti_cheat_logs').insert({
        attempt_id: attemptId,
        event_type: eventType,
        created_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          event_count: eventCountsRef.current[eventType],
          timestamp_ms: now,
        },
      })
    } catch (error) {
      // Silent fail - anti-cheat logging should never break the exam
      console.warn('Anti-cheat log failed:', error)
    }
  }, [attemptId, enabled, supabase])

  /**
   * Update last activity timestamp
   */
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  /**
   * Check for suspicious inactivity
   * Called periodically to detect if student has been inactive too long
   */
  const checkSuspiciousInactivity = useCallback(() => {
    const now = Date.now()
    const elapsed = now - lastActivityRef.current
    
    if (elapsed > SUSPICIOUS_INACTIVITY_THRESHOLD_MS) {
      logEvent('suspicious_timing', {
        inactivity_duration_ms: elapsed,
        inactivity_duration_minutes: Math.floor(elapsed / 60000),
      })
      // Reset to prevent continuous logging
      lastActivityRef.current = now
    }
  }, [logEvent])

  /**
   * Handle visibility change (tab switch)
   */
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logEvent('tab_switch', {
          hidden_at: new Date().toISOString(),
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [enabled, logEvent])

  /**
   * Handle window blur (focus lost)
   */
  useEffect(() => {
    if (!enabled) return

    const handleBlur = () => {
      logEvent('window_blur', {
        blur_at: new Date().toISOString(),
      })
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [enabled, logEvent])

  /**
   * Track user activity for suspicious timing detection
   */
  useEffect(() => {
    if (!enabled) return

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    
    activityEvents.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true })
    })

    // Start periodic inactivity check
    inactivityCheckIntervalRef.current = setInterval(
      checkSuspiciousInactivity,
      60 * 1000 // Check every minute
    )

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, updateActivity)
      })
      
      if (inactivityCheckIntervalRef.current) {
        clearInterval(inactivityCheckIntervalRef.current)
      }
    }
  }, [enabled, updateActivity, checkSuspiciousInactivity])

  /**
   * Log when exam starts (for analytics)
   */
  useEffect(() => {
    if (!enabled || !attemptId) return

    // Log exam session start
    const logSessionStart = async () => {
      try {
        await supabase.from('anti_cheat_logs').insert({
          attempt_id: attemptId,
          event_type: 'exam_session_start',
          created_at: new Date().toISOString(),
          metadata: {
            user_agent: navigator.userAgent,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            window_width: window.innerWidth,
            window_height: window.innerHeight,
          },
        })
      } catch (error) {
        console.warn('Anti-cheat session start log failed:', error)
      }
    }

    logSessionStart()
  }, [attemptId, enabled, supabase])

  // Return utilities for manual event logging if needed
  return {
    logEvent,
    getEventCounts: () => ({ ...eventCountsRef.current }),
  }
}

export default useExamAntiCheat
