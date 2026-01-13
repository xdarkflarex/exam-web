/**
 * Admin OTP (2FA) Utilities
 * 
 * This module provides utilities for generating, storing, and verifying OTPs
 * for admin 2-factor authentication.
 * 
 * SECURITY:
 * - OTP is 6 digits numeric
 * - Expires after 5 minutes
 * - Single-use (marked as used after verification)
 * - Only for admin role users
 */

import { createClient } from '@/lib/supabase/client'

// OTP expiration time in minutes
export const OTP_EXPIRATION_MINUTES = 5

// Cookie name for 2FA verification status
export const ADMIN_2FA_COOKIE = 'admin_2fa_verified'

// 2FA verification expiration (matches session timeout for admin: 15 min idle, 6hr absolute)
export const ADMIN_2FA_EXPIRATION_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Generate a random 6-digit numeric OTP
 */
export function generateOTP(): string {
  // Generate 6 random digits
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  return otp
}

/**
 * Calculate OTP expiration timestamp
 */
export function getOTPExpiration(): Date {
  const now = new Date()
  now.setMinutes(now.getMinutes() + OTP_EXPIRATION_MINUTES)
  return now
}

/**
 * Check if an OTP is expired
 */
export function isOTPExpired(expiresAt: string | Date): boolean {
  const expiration = new Date(expiresAt)
  return new Date() > expiration
}

/**
 * Format OTP for display (add space in middle for readability)
 * e.g., "123456" -> "123 456"
 */
export function formatOTPForDisplay(otp: string): string {
  return `${otp.slice(0, 3)} ${otp.slice(3)}`
}

/**
 * Client-side function to check if admin 2FA is verified
 * Reads from cookie
 */
export function isAdmin2FAVerified(): boolean {
  if (typeof document === 'undefined') return false
  
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === ADMIN_2FA_COOKIE && value === 'true') {
      return true
    }
  }
  return false
}

/**
 * Client-side function to set admin 2FA verification cookie
 */
export function setAdmin2FAVerified(): void {
  if (typeof document === 'undefined') return
  
  // Set cookie with expiration
  const expires = new Date(Date.now() + ADMIN_2FA_EXPIRATION_MS)
  document.cookie = `${ADMIN_2FA_COOKIE}=true; path=/; expires=${expires.toUTCString()}; SameSite=Strict; Secure`
}

/**
 * Client-side function to clear admin 2FA verification
 */
export function clearAdmin2FAVerified(): void {
  if (typeof document === 'undefined') return
  
  document.cookie = `${ADMIN_2FA_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
