import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { XAccountSettings } from "@/components/x-account-settings";
import { getXMonitorSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let databaseError = "";
  let settings: Awaited<ReturnType<typeof getXMonitorSettings>> = { usernames: [], lookbackDays: 7, perAccountPostLimit: null, totalPostLimit: null, source: "none" };
  try {
    settings = await getXMonitorSettings();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content settings-page-content">
        <section className="page-intro"><p className="kicker">SETTINGS · X ACCOUNTS</p><h1>어떤 목소리를<br />들을지 정합니다.</h1><p>여기서는 X 모니터링 계정만 추가·제거합니다. 저장해도 X API는 호출되지 않으며 다음 수집부터 적용됩니다.</p></section>
        {databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>데이터베이스 확인이 필요합니다</strong></div><p>{databaseError}</p></aside> : null}
        <XAccountSettings initialAccounts={settings.usernames} source={settings.source} />
      </div>
      <SiteFooter />
    </main>
  );
}
