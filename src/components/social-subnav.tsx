"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/social", label: "계정 모니터링", exact: true },
  { href: "/social/tickers", label: "티커 모니터링" },
];

const UTILITIES = [
  { href: "/history", label: "히스토리" },
  { href: "/settings", label: "계정 설정" },
];

export function SocialSubnav() {
  const pathname = usePathname();
  return <div className="social-subnav-wrap">
    <nav className="section-subnav social-subnav" aria-label="X 모니터링 유형">
      {ITEMS.map((item) => <Link className={(item.exact ? pathname === item.href : pathname.startsWith(item.href)) ? "active" : ""} href={item.href} prefetch key={item.href}>{item.label}</Link>)}
    </nav>
    <nav className="social-utility-nav" aria-label="X 모니터링 보조 메뉴">
      {UTILITIES.map((item) => <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} prefetch key={item.href}>{item.label}</Link>)}
    </nav>
  </div>;
}
