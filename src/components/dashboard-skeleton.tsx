import { SiteHeader } from "@/components/site-header";

export function DashboardSkeleton({ kicker, title }: { kicker: string; title: string }) {
  return (
    <main className="dashboard-page" aria-busy="true" aria-label={`${title} 데이터를 불러오는 중`}>
      <SiteHeader />
      <div className="page-shell dashboard-content dashboard-skeleton">
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">{kicker}</p><h1>{title}</h1><div className="skeleton-line wide" /><div className="skeleton-line medium" /></div>
          <div className="refresh-panel skeleton-panel"><div className="skeleton-label" /><div className="skeleton-value" /><div className="skeleton-button" /></div>
        </section>
        <section className="skeleton-section">
          <div className="skeleton-heading" />
          <div className="skeleton-card-grid">
            {Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index}><div className="skeleton-label" /><div className="skeleton-value short" /><div className="skeleton-chart"><i /><i /><i /></div></div>)}
          </div>
        </section>
      </div>
    </main>
  );
}
