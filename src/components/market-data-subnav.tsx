"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/macro", label: "매크로" },
  { href: "/market", label: "시장지수" },
];

export function MarketDataSubnav() {
  const pathname = usePathname();
  return <nav className="section-subnav" aria-label="시장 데이터 메뉴">
    {ITEMS.map((item) => <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
  </nav>;
}
