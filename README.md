# Black Turtle

미국 주식 투자 판단을 위해 FRED 매크로 지표와 지정한 X 계정의 기업 언급·감성을 저장해 보여주는 개인용 모바일 대시보드입니다.

## 동작 원칙

- 페이지 접속은 Supabase에 저장된 마지막 성공 스냅샷만 읽습니다.
- FRED/X API는 로그인 후 `데이터 갱신` 버튼을 누를 때만 호출합니다.
- 갱신 도중 또는 실패 시 기존 스냅샷을 계속 보여줍니다.
- 한 번 로그인한 기기는 서명된 HttpOnly 쿠키로 90일 동안 기억합니다.
- 외부 API 키와 Supabase secret key는 서버에서만 사용합니다.

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

`.env.local`의 값을 채운 후 Supabase SQL Editor에서
`supabase/migrations/202607200001_initial.sql`을 실행합니다.

## 검증

```bash
npm run check
```

자세한 사용자 설정 순서는 `SETUP.html`, 구현 구조는 `plan.html`에 있습니다.
