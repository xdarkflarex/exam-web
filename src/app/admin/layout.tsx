'use client'

import { AdminSidebar } from '@/components/admin'
import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'
import { usePathname } from 'next/navigation'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isVerifyOtpPage = pathname === '/admin/verify-otp'

  return (
    <SessionTimeoutProvider role="admin">
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        {/* Sidebar - dimmed/blurred on verify-otp page */}
        <div className={`${isVerifyOtpPage ? 'opacity-30 blur-sm pointer-events-none' : ''} transition-all duration-300`}>
          <AdminSidebar />
        </div>
        
        {/* Main Content Area - responsive margin */}
        <div className="lg:ml-64">
          {/* Content */}
          <main className="min-h-screen pt-14 lg:pt-0">
            {children}
          </main>
        </div>
      </div>
    </SessionTimeoutProvider>
  )
}
