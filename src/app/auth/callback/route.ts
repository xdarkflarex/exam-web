import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getDefaultRedirectPath } from '@/lib/auth/roles'
import { logger } from '@/lib/logger'

/**
 * OAuth Callback Route
 * 
 * Handles the callback from OAuth providers (Google, etc.)
 * 
 * Flow:
 * 1. Exchange OAuth code for session
 * 2. Check if user has a profile in database
 * 3. If profile EXISTS → redirect to appropriate dashboard
 * 4. If profile DOES NOT exist → redirect to /complete-profile
 * 
 * IMPORTANT: We do NOT auto-create profiles. Users must complete their profile manually.
 * This is for security and data quality reasons.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  // Determine the correct origin for redirects
  // In development, use localhost; in production, use the actual domain
  const origin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )

    // Exchange code for session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      logger.error('OAuth code exchange error', exchangeError)
      return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=no_user`)
    }

    // Check if user has a profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // ============================================
    // PROFILE CHECK - DO NOT AUTO-CREATE
    // ============================================
    if (!profile || !profile.role) {
      // New Google user without profile
      // Redirect to complete-profile page to collect required info
      return NextResponse.redirect(`${origin}/complete-profile`)
    }

    // Existing user with profile - redirect to appropriate dashboard
    const redirectPath = getDefaultRedirectPath(profile.role)
    return NextResponse.redirect(`${origin}${redirectPath}`)
  }

  // No code provided - redirect to login
  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
