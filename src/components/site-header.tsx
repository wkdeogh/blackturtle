"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/dashboard-actions";
import { GlobalRefreshControl } from "@/components/global-refresh-control";
import { GlobalRefreshIndicator } from "@/components/global-refresh-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { TurtleLogo } from "@/components/turtle-logo";

const NAV_ITEMS = [
  { href: "/macro", label: "시장 데이터", related: ["/market"] },
  { href: "/social", label: "X 모니터링", related: ["/history", "/settings"] },
  { href: "/analysis", label: "종합분석" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const navigation = NAV_ITEMS.map((item) => <Link className={pathname.startsWith(item.href) || item.related?.some((path) => pathname.startsWith(path)) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>);
  return (
    <>
      <header className="site-header">
        <div className="page-shell header-inner">
          <Link className="wordmark" href="/macro" aria-label="Black Turtle 홈"><TurtleLogo priority /><span>BLACK TURTLE<small>INVESTMENT DESK</small></span></Link>
          <nav className="site-nav desktop-site-nav" aria-label="대시보드 메뉴">{navigation}</nav>
          <div className="header-actions"><GlobalRefreshIndicator /><GlobalRefreshControl /><ThemeToggle /><span className="private-label">PRIVATE</span><LogoutButton /></div>
        </div>
      </header>
      <nav className="mobile-site-nav" aria-label="모바일 대시보드 메뉴">{navigation}</nav>
    </>
  );
}
