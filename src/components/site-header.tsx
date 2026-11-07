"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/dashboard-actions";
import { GlobalRefreshControl } from "@/components/global-refresh-control";
import { GlobalRefreshIndicator } from "@/components/global-refresh-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { TurtleLogo } from "@/components/turtle-logo";

const NAV_ITEMS = [
  { href: "/macro", label: "시장 데이터", related: ["/market", "/regime", "/portfolio", "/events"] },
  { href: "/market-cap", label: "시가총액" },
  { href: "/social", label: "X 모니터링", related: ["/history", "/settings"] },
  { href: "/analysis", label: "종합분석" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const navigation = NAV_ITEMS.map((item) => <Link className={matches(item.href) || item.related?.some(matches) ? "active" : ""} href={item.href} prefetch key={item.href}>{item.label}</Link>);
  return (
    <>
      <header className="site-header">
        <div className="page-shell header-inner">
          <Link className="wordmark" href="/macro" prefetch aria-label="Black Turtle 홈"><TurtleLogo priority /><span>BLACK TURTLE<small>INVESTMENT DESK</small></span></Link>
          <nav className="site-nav desktop-site-nav" aria-label="대시보드 메뉴">{navigation}</nav>
          <div className="header-actions"><GlobalRefreshIndicator /><GlobalRefreshControl /><Link className="notification-settings-link" href="/settings#notifications" aria-label="푸시 알림 설정" title="푸시 알림 설정"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg></Link><ThemeToggle /><span className="private-label">PRIVATE</span><LogoutButton /></div>
        </div>
      </header>
      <nav className="mobile-site-nav" aria-label="모바일 대시보드 메뉴">{navigation}</nav>
    </>
  );
}
