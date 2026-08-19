import { DataSourceStatusList } from "@/components/data-source-status";
import { MarketDataSubnav } from "@/components/market-data-subnav";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getInvestorResearchState, getPortfolioItems } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const [portfolio, research] = await Promise.all([getPortfolioItems(), getInvestorResearchState()]);
  return <main className="dashboard-page"><SiteHeader /><div className="page-shell dashboard-content"><MarketDataSubnav />
    <section className="dashboard-hero compact-hero"><div><p className="kicker">PORTFOLIO & WATCHLIST</p><h1>포트폴리오</h1><p className="hero-copy">보유 수량과 평균단가뿐 아니라 투자 근거와 무효화 조건을 함께 기록합니다. 활성 종목의 가격·SEC 공시·실적 일정은 시장지수 갱신에 포함됩니다.</p></div><div className="refresh-panel"><span>DATA POLICY</span><strong>통화별로 분리</strong><p className="hero-side-note">환율을 임의 적용하지 않고 USD·KRW 평가액을 구분해 표시합니다.</p></div></section>
    <DataSourceStatusList statuses={research.market.statuses} title="포트폴리오 데이터 상태" />
    <PortfolioDashboard initialItems={portfolio.items} research={research.market} migrationReady={portfolio.migrationReady && research.migrationReady} />
  </div><SiteFooter /></main>;
}
