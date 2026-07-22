import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Black Turtle · Investment Desk",
  description: "시장 심리·경제 지표와 X 기업 시그널을 한곳에서 보는 개인 투자 대시보드",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c110f" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("blackturtle-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
