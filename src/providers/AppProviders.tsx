'use client'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import LoadingPopup from '@/components/LoadingPopup'

interface AppProvidersProps {
  children: React.ReactNode
}

export default function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <LoadingProvider>
        {children}
        <LoadingPopup />
      </LoadingProvider>
    </ThemeProvider>
  )
}
