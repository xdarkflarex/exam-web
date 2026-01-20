import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'
import { StudentSidebar } from '@/components/student'

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionTimeoutProvider role="student">
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <StudentSidebar />
        <div className="lg:ml-64 pt-14 lg:pt-0 pb-20 lg:pb-0">
          {children}
        </div>
      </div>
    </SessionTimeoutProvider>
  )
}
