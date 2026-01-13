import { AdminSidebar, AdminHeader } from '@/components/admin'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <AdminSidebar />
      
      {/* Main Content Area */}
      <div className="ml-64">
        {/* Content */}
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
