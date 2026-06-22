# 庄栄運輸 運行・勤怠管理システム

ダンプ運送事業者「庄栄運輸」向けの運行・勤怠管理 Web アプリケーション。
現行（GAS + Google スプレッドシート + LIFF）を **Next.js + Supabase + LINE** へ再構築する。

> 要件の正本: `運行勤怠管理システム_要件定義書.docx.txt`（株式会社RITAVERSE / 2026-06-15, v1.0）

## 技術スタック

| 区分 | 採用 |
| --- | --- |
| フロント/サーバ | Next.js 15 (App Router) / React 19 / TypeScript |
| DB / 認証 / 保存 | Supabase（PostgreSQL・Auth・RLS・Storage・Realtime） |
| 通知 / ドライバー認証 | LINE Messaging API（管理者push）/ LIFF |
| その他 | Tailwind CSS / Zod |

## セットアップ

```bash
# 1) 依存インストール
npm install

# 2) 環境変数
cp .env.example .env.local   # 値を実プロジェクトのものに差し替え

# 3) 開発サーバ
npm run dev                  # http://localhost:3000
```

### Supabase（DB）

ローカルDBは Docker が必要（`supabase start`）。Docker 未導入の場合はホスト型プロジェクトに
マイグレーションを適用する:

```bash
supabase login
supabase link --project-ref <your-project-ref>
npm run db:push              # supabase/migrations/0001〜0008 を適用
npm run db:types             # 実DBから src/types/database.ts を再生成（推奨）
```

> マイグレーションは `supabase/migrations/`。改善基準告示の判定パラメータ初期値は `0007`。
> 開発サンプルは `supabase/seed.sql`（`supabase db reset` で投入）。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` / `npm run start` | 本番ビルド / 起動 |
| `npm run typecheck` | 型チェック（tsc --noEmit） |
| `npm run lint` | ESLint |
| `npm run db:push` | マイグレーション適用 |
| `npm run db:types` | DB から型生成 |

## 画面（アクター別 入口）

- `/driver` … ドライバー（スマホ / LIFF） — 打刻・日報
- `/office` … 据置端末（事務所共用） — 出退勤のみ
- `/admin`  … 運行管理者（Supabase Auth） — 盤面・集計・是正・帳票

## API（仕様書 第8章）

すべて認証必須。`POST /api/events`（打刻）, `GET /api/events/today`,
`GET /api/dispatch-plans/today`, `GET|POST /api/daily-reports`,
`GET /api/admin/board|line-usage|warnings`, `POST /api/admin/warnings/:id/correction`,
`POST /api/admin/monthly-summary`, `POST /api/admin/shifts/:id`,
`POST /api/reports/:date/:driverId/pdf`, `GET /api/vehicles/:no/last-meter`,
`POST /api/line/webhook`, `POST /api/auth/line`。

## 実装状況

**完了（基盤フェーズ）**: プロジェクト雛形 / DBスキーマ・RLS・Storage / 認証基盤（管理者Auth・ドライバーLINE）/
改善基準告示 計算・判定モジュール / LINE基盤（署名検証・push・Flex・LIFF）/ API雛形 / 画面導線。
`npm run build` / `typecheck` / `lint` すべてグリーン。

**次フェーズ（TODO はコード内に明示）**: 打刻パイプライン完全版（二重打刻防止・shift連結・逆ジオ・通知・集計）/
日報の自動補完・保存・確定→PDF / 月次集計 / 運行盤面 Realtime / 移行スクリプト。

詳細は [CLAUDE.md](CLAUDE.md) と [docs/](docs/) を参照。

## 既知の注意点

- middleware で supabase-js が `process.version` を参照するため Edge Runtime の警告が出るが、ビルド・動作に影響なし。
- `src/types/database.ts` は手書きの暫定型。実DB接続後は `npm run db:types` で自動生成へ差し替えること。
- 改善基準告示の判定数値（`app_settings('compliance')`）は実装の出発点。**運用前に最新法令・社労士確認で要検証**。
