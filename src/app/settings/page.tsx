import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SocialSubnav } from "@/components/social-subnav";
import { XAccountSettings } from "@/components/x-account-settings";
import { getXMonitorSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let databaseError = "";
  let settings: Awaited<ReturnType<typeof getXMonitorSettings>> = { accounts: [], usernames: [], lookbackDays: 7, perAccountPostLimit: null, totalPostLimit: null, source: "none", accountStatusReady: false };
  try {
    settings = await getXMonitorSettings();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content settings-page-content">
        <SocialSubnav />
        <section className="page-intro"><p className="kicker">SETTINGS</p><h1>X 모니터링 계정</h1><p>계정을 추가·제거하거나 체크박스로 수집 여부를 정합니다. 저장해도 X API는 호출되지 않으며 다음 수집부터 적용됩니다.</p></section>
        {databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>데이터베이스 확인이 필요합니다</strong></div><p>{databaseError}</p></aside> : null}
        {!settings.accountStatusReady ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>계정 활성화 설정이 필요합니다</strong></div><p>Supabase SQL Editor에서 마이그레이션을 번호순으로 최신 <code>202607210008_x_account_enabled.sql</code>까지 실행하세요.</p></aside> : null}
        <XAccountSettings initialAccounts={settings.accounts} source={settings.source} statusReady={settings.accountStatusReady} />
      </div>
      <SiteFooter />
    </main>
  );
}
