"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/social", label: "모니터링 결과" },
  { href: "/history", label: "히스토리" },
  { href: "/settings", label: "계정 설정" },
];

export function SocialSubnav() {
  const pathname = usePathname();
  return <nav className="social-subnav" aria-label="X 모니터링 메뉴">
    {ITEMS.map((item) => <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
  </nav>;
}
