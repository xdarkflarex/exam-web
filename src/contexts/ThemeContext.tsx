'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme | null>(null)

  // Init theme ONCE on client
  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    const system =
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    const initialTheme = saved ?? system
    setTheme(initialTheme)
    document.documentElement.classList.toggle('dark', initialTheme === 'dark')
  }, [])

  // Set theme directly
  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  // Toggle
  const toggleTheme = () => {
    if (!theme) return
    const next = theme === 'light' ? 'dark' : 'light'
    handleSetTheme(next)
  }

  // ⛔ CRITICAL: block render until mounted
  if (theme === null) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
