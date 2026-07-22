"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/dashboard-actions";
import { GlobalRefreshIndicator } from "@/components/global-refresh-indicator";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/macro", label: "매크로" },
  { href: "/market", label: "시장지수" },
  { href: "/social", label: "X 모니터링", related: ["/history", "/settings"] },
  { href: "/analysis", label: "종합분석" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="page-shell header-inner">
        <Link className="wordmark" href="/macro"><span className="turtle-mark" aria-hidden="true"><span /></span><span>BLACK TURTLE<small>INVESTMENT DESK</small></span></Link>
        <nav className="site-nav" aria-label="대시보드 메뉴">
          {NAV_ITEMS.map((item) => <Link className={pathname.startsWith(item.href) || item.related?.some((path) => pathname.startsWith(path)) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className="header-actions"><GlobalRefreshIndicator /><ThemeToggle /><span className="private-label">PRIVATE</span><LogoutButton /></div>
      </div>
    </header>
  );
}
