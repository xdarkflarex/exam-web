import type { Metadata } from "next";
import { Inter, Baloo_2 } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const baloo2 = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Luyện Thi Toán THPT",
  description: "Hệ thống luyện thi toán THPT thông minh",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/*
          Đặt class `dark` TRƯỚC KHI TRÌNH DUYỆT VẼ khung hình đầu tiên.

          Không có script này, `.dark` chỉ được gắn trong `useEffect` của
          `ThemeProvider` — tức là sau khi HTML đã hiển thị. Người dùng để dark
          mode sẽ thấy một nháy TRẮNG ở mỗi lần tải trang, và với những trang
          điều hướng bằng full reload (cấu hình đề thi, publish đề) thì cú nháy
          đó dài đủ để trông như "hệ thống tự trả về light mode".

          Phải là inline script trong <head>: mọi cách khác (component, effect,
          CSS-in-JS) đều chạy sau lượt vẽ đầu.

          `colorScheme` đi kèm để form control, scrollbar và ô nhập của trình
          duyệt cũng đổi theo — thiếu nó thì trong dark mode các input vẫn nền
          trắng, đúng một trong những chỗ "không đồng nhất" dễ thấy nhất.

          try/catch vì localStorage ném lỗi ở chế độ ẩn danh của một số trình
          duyệt; hỏng theme thì thà về mặc định còn hơn chặn cả trang.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`,
          }}
        />
      </head>
      {/*
        Màu nền/chữ do `html, body` trong globals.css quyết định qua biến
        `--background` / `--foreground`. Trước đây body còn hardcode
        `bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200`,
        tức HAI nguồn sự thật cho cùng một thứ — và bảng màu "chống mỏi mắt"
        khai báo trong globals.css không bao giờ có tác dụng vì Tailwind
        utility thắng selector `html, body`.
      */}
      <body className={`${inter.variable} ${baloo2.variable} font-sans antialiased`} suppressHydrationWarning>
        <div suppressHydrationWarning>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}