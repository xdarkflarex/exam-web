'use client'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import LoadingOverlay from '@/components/LoadingOverlay'
import { usePathname } from 'next/navigation'

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname.startsWith('/login')

  return (
    <ThemeProvider>
      <LoadingProvider>
        {children}
        {!isAuthRoute && <LoadingOverlay />}
      </LoadingProvider>
    </ThemeProvider>
  )
}
