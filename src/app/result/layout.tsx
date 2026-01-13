import SessionTimeoutProvider from '@/components/SessionTimeoutProvider'

export default function ResultLayout({
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
