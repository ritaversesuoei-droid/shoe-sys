# デプロイ・本番化ガイド

庄栄運輸 運行・勤怠管理システムの本番デプロイ手順。

## 0. 前提

- Supabase 本番プロジェクト（dev とは別推奨）
- LINE: Messaging API チャネル（管理者通知）+ LINE Login チャネル + LIFF アプリ（ドライバー）
- ホスティング: Vercel（推奨）または Node 20+ のセルフホスト

## 1. 環境変数

`.env.example` をもとに本番値を設定（ホスティングの環境変数機能、または `.env.local`）。

| 変数 | 用途 | 公開 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 接続（RLS保護） | 公開可 |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー内部処理（RLSバイパス） | **秘匿** |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | Messaging API（push・Webhook署名検証） | **秘匿** |
| `LINE_LOGIN_CHANNEL_ID` | LIFF IDトークン検証(aud) | 秘匿寄り |
| `NEXT_PUBLIC_LIFF_ID` | LIFF 初期化 | 公開可 |
| `LINE_ADMIN_TARGET_ID` | 通知先（管理者グループ/ユーザー） | 秘匿寄り |
| `OFFICE_TERMINAL_TOKEN` | 据置端末の解錠トークン | **秘匿** |
| `GEOCODER` / `GOOGLE_MAPS_API_KEY` | 逆ジオ（gsi/google/none） | google時のみキー秘匿 |
| `PUPPETEER_EXECUTABLE_PATH` | PDF用ブラウザ（後述） | 環境依存 |
| `NEXT_PUBLIC_APP_URL` / `APP_TIMEZONE` | 絶対URL / JST固定 | 公開可 |

> `.env.local` はコミット禁止（`.gitignore` 済）。秘匿値はホスティングの Secret 機能へ。

## 2. データベース（Supabase）

```bash
supabase login
supabase link --project-ref <本番ref>
npm run db:push        # supabase/migrations/0001〜0008 を適用
npm run db:types       # 型を本番スキーマから再生成（任意）
```

- 認証: ダッシュボードで Email/Password を有効化（管理者）。MFA 推奨（仕様書10）。
- 初期管理者: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run provision:admin`
- Storage: `event-photos`(0008) は非公開。`reports` はPDF初回生成時に自動作成（非公開）。
- 判定パラメータ: `app_settings('compliance')` は 0007 で投入。運用前に **社労士確認**のうえ `/admin/settings` で確定値へ。

## 3. ホスティング

### Vercel（推奨）
1. GitHub リポジトリ（`ritaversesuoei-droid/shoe-sys`）を Vercel に接続。
2. 環境変数（上表）を設定。
3. デプロイ（`npm run build`）。

### セルフホスト
```bash
npm ci && npm run build && npm run start   # 既定 :3000。リバースプロキシでHTTPS終端
```

## 4. PDF（Puppeteer）の本番対応

`src/lib/pdf/render.ts` は `PUPPETEER_EXECUTABLE_PATH` のブラウザを使う。

- **セルフホスト**: サーバーに Chrome/Chromium を入れ、そのパスを `PUPPETEER_EXECUTABLE_PATH` に設定。
- **Vercel/サーバーレス**: 実行環境に Chrome が無いため `@sparticuz/chromium` を導入し、`render.ts` の起動部を差し替える:
  ```ts
  // npm i @sparticuz/chromium
  import chromium from "@sparticuz/chromium";
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
  ```
  または PDF 生成を別サービス/キューに分離（重い処理のため）。

## 5. LINE 設定

- **Messaging API**: Webhook URL = `https://<本番ドメイン>/api/line/webhook`（署名検証は実装済み・必須）。
- **LIFF**: エンドポイント URL = `https://<本番ドメイン>/driver`。LIFF ID を `NEXT_PUBLIC_LIFF_ID` に。
- **LINE Login**: チャネルID を `LINE_LOGIN_CHANNEL_ID` に（IDトークン検証用）。
- ドライバーは初回 LINE ログインで自動プロビジョニング（`/api/auth/line`）。事前に `drivers.line_user_id` を紐付けるか、運用で対応。

## 6. データ移行（任意）

現行スプレッドシートからの移行は `migration/README.md` 参照。マスタは `npm run migrate:masters`、
明細系（events/shifts/daily_reports）は専用変換（11.1）後に全shift指標を再計算・突合。

## 7. デプロイ後チェックリスト

- [ ] `npm run smoke`（`BASE_URL=https://本番` 指定）で全ルート 5xx=0
- [ ] 管理者ログイン → ダッシュボード/月次/警告/マスタ/設定 が表示
- [ ] ドライバー（LIFF）ログイン → 打刻 → ダッシュボードに反映
- [ ] 退勤打刻 → 改善基準告示判定 → 違反時 LINE 警告 push
- [ ] 日報確定 → PDF 生成・閲覧（署名付きURL）
- [ ] LINE Webhook 署名検証が有効（不正署名で401）
- [ ] バックアップ（Supabase 日次・Storage 含む）設定

## 8. 運用注意

- `next dev` 稼働中に `npm run build` を実行しない（`.next` 破損。`CLAUDE.md` 参照）。
- 秘匿情報は環境変数のみ・コード直書き禁止（仕様書 12.1）。
- 改善基準告示の数値は法令改正・労使協定に追従（`/admin/settings` で更新）。
