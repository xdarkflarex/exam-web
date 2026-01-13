import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionTimeoutProvider role="student">
      {children}
    </SessionTimeoutProvider>
  )
}
