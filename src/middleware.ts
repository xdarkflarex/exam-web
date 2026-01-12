import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, isStudent, getDefaultRedirectPath } from '@/lib/auth/roles'


export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Allow login page for everyone
  if (pathname === '/login') {
    // If already authenticated, redirect to appropriate dashboard
    if (user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role) {
          const redirectPath = getDefaultRedirectPath(profile.role)
          return NextResponse.redirect(new URL(redirectPath, request.url))
        }
      } catch (error) {
        console.error('Profile fetch error in middleware:', error)
      }
    }
    return response
  }

  // Redirect unauthenticated users to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Get user role
  let userRole = null
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    userRole = profile?.role
  } catch (error) {
    console.error('Profile fetch error in middleware:', error)
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!userRole) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Route protection logic
  const isAdminRoute = pathname.startsWith('/admin')
  const isStudentRoute = pathname.startsWith('/student') || pathname.startsWith('/result')

  if (isAdminRoute && !isAdmin(userRole)) {
    // Non-admin trying to access admin routes
    return NextResponse.redirect(new URL('/student', request.url))
  }

  if (isStudentRoute && !isStudent(userRole)) {
    // Non-student trying to access student routes
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // Root path redirect
  if (pathname === '/') {
    const redirectPath = getDefaultRedirectPath(userRole)
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
