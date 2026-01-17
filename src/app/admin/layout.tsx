import { AdminSidebar } from '@/components/admin'
import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionTimeoutProvider role="admin">
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        {/* Sidebar */}
        <AdminSidebar />
        
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
