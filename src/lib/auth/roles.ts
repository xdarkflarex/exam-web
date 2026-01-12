/**
 * Role utility functions for the exam system
 * Treats 'teacher' as admin for MVP simplicity
 */

export type UserRole = 'student' | 'teacher' | 'admin'

/**
 * Check if user has admin privileges
 * Currently treats both 'teacher' and 'admin' roles as admin
 * Future-proof for when real admin role distinction is needed
 */
export const isAdmin = (role: UserRole | null | undefined): boolean => {
  return role === 'teacher' || role === 'admin'
}

/**
 * Check if user is a student
 */
export const isStudent = (role: UserRole | null | undefined): boolean => {
  return role === 'student'
}

/**
 * Get the appropriate redirect path based on user role
 */
export const getDefaultRedirectPath = (role: UserRole | null | undefined): string => {
  if (isAdmin(role)) {
    return '/admin'
  }
  if (isStudent(role)) {
    return '/student'
  }
  return '/login'
}

/**
 * Get display label for user role
 * Maps database roles to user-friendly display labels
 */
export const getRoleDisplayLabel = (role: UserRole | null | undefined): string => {
  if (role === 'teacher' || role === 'admin') {
    return 'Admin'
  }
  if (role === 'student') {
    return 'Học sinh'
  }
  return 'Không xác định'
}
