import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="turtle-mark large" aria-hidden="true"><span /></div>
        <p className="kicker">PRIVATE INVESTMENT DESK</p>
        <h1>Black Turtle</h1>
        <p className="login-copy">저장된 시장 데이터와 투자 시그널을 확인하려면 비밀번호를 입력하세요.</p>
        <Suspense fallback={<div className="login-loading">로그인 준비 중…</div>}>
          <LoginForm />
        </Suspense>
      </section>
      <p className="login-footer">SLOW DATA · CLEAR SIGNALS</p>
    </main>
  );
}
