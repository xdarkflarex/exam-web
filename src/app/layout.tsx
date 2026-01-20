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
      <body className={`${inter.variable} ${baloo2.variable} font-sans antialiased bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200`} suppressHydrationWarning>
        <div suppressHydrationWarning>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}