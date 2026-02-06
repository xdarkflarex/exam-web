/**
 * Centralized Logger Utility
 * 
 * Production-safe logging that:
 * - Only logs in development mode
 * - Provides consistent log format
 * - Can be extended for external services (Sentry, LogRocket, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Format log message with timestamp and context
 */
function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString()
  const contextStr = context ? ` | ${JSON.stringify(context)}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
}

/**
 * Log to console in development only
 */
function logToConsole(level: LogLevel, message: string, context?: LogContext): void {
  if (!isDevelopment) return

  const formattedMessage = formatMessage(level, message, context)

  switch (level) {
    case 'debug':
      console.debug(formattedMessage)
      break
    case 'info':
      console.info(formattedMessage)
      break
    case 'warn':
      console.warn(formattedMessage)
      break
    case 'error':
      console.error(formattedMessage)
      break
  }
}

/**
 * Send error to external monitoring service
 * TODO: Integrate with Sentry, LogRocket, or similar
 */
function sendToMonitoring(error: Error | string, context?: LogContext): void {
  // In production, send to error monitoring service
  // Example Sentry integration:
  // if (typeof window !== 'undefined' && window.Sentry) {
  //   window.Sentry.captureException(error, { extra: context })
  // }
  
  // For now, just log in development
  if (isDevelopment) {
    console.error('[MONITORING]', error, context)
  }
}

/**
 * Logger object with all log levels
 */
export const logger = {
  /**
   * Debug level - for development debugging
   */
  debug(message: string, context?: LogContext): void {
    logToConsole('debug', message, context)
  },

  /**
   * Info level - for general information
   */
  info(message: string, context?: LogContext): void {
    logToConsole('info', message, context)
  },

  /**
   * Warn level - for warnings that don't break functionality
   */
  warn(message: string, context?: LogContext): void {
    logToConsole('warn', message, context)
  },

  /**
   * Error level - for errors that need attention
   * In production, this should send to monitoring service
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    logToConsole('error', message, context)
    
    // In production, send to monitoring
    if (!isDevelopment && error) {
      sendToMonitoring(error instanceof Error ? error : String(error), context)
    }
  },

  /**
   * Log Supabase errors with RLS-friendly messages
   */
  supabaseError(
    operation: string, 
    error: { code?: string; message?: string; details?: string; hint?: string } | null,
    context?: LogContext
  ): string {
    const errorContext = {
      ...context,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint
    }
    
    logToConsole('error', `Supabase ${operation} failed`, errorContext)

    // Return user-friendly message based on error code
    if (error?.code === 'PGRST301' || error?.message?.includes('RLS')) {
      return 'Bạn không có quyền thực hiện thao tác này'
    }
    
    if (error?.code === '23505') {
      return 'Dữ liệu đã tồn tại trong hệ thống'
    }
    
    if (error?.code === '23503') {
      return 'Dữ liệu liên quan không tồn tại'
    }

    if (error?.code === 'PGRST116') {
      return 'Không tìm thấy dữ liệu'
    }

    return 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
  }
}

export default logger
