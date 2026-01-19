'use client'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import LoadingOverlay from '@/components/LoadingOverlay'
import { MathProvider } from '@/components/MathContent'
import { usePathname } from 'next/navigation'

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname.startsWith('/login')

  return (
    <ThemeProvider>
      <LoadingProvider>
        <MathProvider>
          {children}
        </MathProvider>
        {!isAuthRoute && <LoadingOverlay />}
      </LoadingProvider>
    </ThemeProvider>
  )
}
