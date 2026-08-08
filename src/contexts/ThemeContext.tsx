'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

/**
 * Đọc theme từ trạng thái DOM mà script inline trong `layout.tsx` đã đặt.
 *
 * Script đó chạy trước lượt vẽ đầu tiên, nên tới lúc React khởi tạo state thì
 * class `dark` đã đúng. Đọc lại từ DOM thay vì tự tính lại localStorage +
 * matchMedia giữ cho chỉ có MỘT nơi quyết định theme ban đầu; hai nơi cùng tính
 * là hai nơi có thể lệch nhau.
 *
 * Trên server không có `document`, trả 'light' làm giá trị dựng HTML. Giá trị
 * này không gây nháy màu vì script inline đã sửa class trước khi trang hiện ra.
 */
function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  // Đồng bộ `colorScheme` cho lần render đầu của client. Script inline đã đặt
  // rồi; dòng này chỉ để trạng thái không lệch nếu ai đó đổi class bằng tay
  // (DevTools, extension) trước khi React gắn vào.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    try {
      localStorage.setItem('theme', newTheme)
    } catch {
      // Chế độ ẩn danh chặn localStorage: vẫn đổi được theme cho phiên hiện tại,
      // chỉ là không nhớ được. Ném lỗi ở đây sẽ làm hỏng cả nút bấm.
    }
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    document.documentElement.style.colorScheme = newTheme
  }

  const toggleTheme = () => {
    handleSetTheme(theme === 'light' ? 'dark' : 'light')
  }

  // CỐ Ý KHÔNG chặn render chờ mount.
  //
  // Bản trước `return null` cho tới khi effect chạy xong, nghĩa là toàn bộ ứng
  // dụng không có HTML nào ở lượt vẽ đầu: trang trắng rồi mới hiện nội dung, và
  // nội dung server render ra bị vứt đi. Với script inline trong `layout.tsx`,
  // class theme đã đúng từ trước khi vẽ nên không còn lý do gì phải chặn.
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
