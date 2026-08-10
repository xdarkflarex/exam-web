import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'
import { StudentSidebar } from '@/components/student'
import ActiveExamBanner from '@/components/student/ActiveExamBanner'

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionTimeoutProvider role="student">
      {/*
        Nền KHÔNG đặt bằng utility. `globals.css` đã có
        `html, body { background-color: var(--background) }`, và `--background`
        (#eef1f6) là giá trị đã hiệu chỉnh để bớt chói khi ngồi làm bài lâu.
        Đè `bg-slate-100` lên trên là vứt bỏ phần hiệu chỉnh đó — xem
        docs/DESIGN_TODO.md mục 0 bất biến 2.
      */}
      <div className="min-h-screen">
        <StudentSidebar />
        {/*
          Desktop chừa 64px TRÊN ĐẦU cho thanh ngang, không còn chừa 256px bên
          trái. Mobile giữ nguyên: 56px thanh trên, 80px thanh dưới.
        */}
        <div className="pt-14 pb-20 lg:pt-16 lg:pb-0">
          {children}
        </div>
        <ActiveExamBanner />
      </div>
    </SessionTimeoutProvider>
  )
}
