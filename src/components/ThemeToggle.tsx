'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'

/**
 * Nút đổi sáng/tối.
 *
 * HAI QUY TẮC CỦA COMPONENT NÀY, cả hai đều đến từ lỗi thật:
 *
 * 1. **Markup KHÔNG được phụ thuộc giá trị `theme` của JS.** Icon nào hiện là do
 *    CSS quyết định qua biến thể `dark:`. Bản trước đổi class bằng `theme ===
 *    'dark' ? ... : ...`, mà trên server `theme` luôn là `'light'` (không có
 *    `document` để đọc class) còn trên client là giá trị thật -> HTML server và
 *    client khác nhau -> React báo lệch hydration.
 *
 *    Cách này còn đúng hơn về bản chất: class `.dark` trên `<html>` do script
 *    inline đặt TRƯỚC lượt vẽ đầu, nên icon hiện đúng ngay cả trước khi React
 *    hydrate xong. Dựa vào state React thì luôn trễ hơn một nhịp.
 *
 * 2. **`className` viết một dòng.** Chuỗi xuống dòng trong tệp CRLF mang `\r\n`
 *    vào thuộc tính HTML, và server/client chuẩn hoá khoảng trắng khác nhau —
 *    cũng ra lệch hydration, nhưng vì lý do hoàn toàn khác.
 *
 * `useTheme` vẫn cần cho `onClick`; handler không ảnh hưởng HTML nên không gây
 * lệch.
 */
export default function ThemeToggle() {
  const { toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Đổi giao diện sáng/tối"
      className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-all duration-200 active:scale-90"
    >
      <span className="relative block w-5 h-5">
        <Sun className="w-5 h-5 absolute inset-0 transition-all duration-300 text-amber-500 opacity-100 rotate-0 scale-100 dark:opacity-0 dark:rotate-90 dark:scale-0" />
        <Moon className="w-5 h-5 absolute inset-0 transition-all duration-300 text-blue-400 opacity-0 -rotate-90 scale-0 dark:opacity-100 dark:rotate-0 dark:scale-100" />
      </span>
    </button>
  )
}
