# CLAUDE.md — 昭栄運輸 運行・勤怠管理システム

このファイルは Claude Code（および開発者）向けのプロジェクト指針です。

## 概要

ダンプ運送事業者「昭栄運輸」向けの運行・勤怠管理 Web アプリ。
現行（GAS + Google スプレッドシート + LIFF）を **Next.js + Supabase + LINE** へ再構築する。
正本の要件は `運行勤怠管理システム_要件定義書.docx.txt`（リポジトリ同梱）。

## 技術スタック

- **Next.js 15（App Router）/ React 19 / TypeScript**
- **Supabase**: PostgreSQL（正規化）・Auth・RLS・Storage・Realtime
- **LINE**: Messaging API（管理者push）+ LIFF（ドライバー認証）
- Tailwind CSS / Zod

## 確定した方針（初期ヒアリング）

- 進め方: **基盤から構築**（DB→認証→lib→API→画面）
- 改善基準告示の判定: **最新法令準拠で再設計**。閾値は `app_settings('compliance')` で構成管理
  （`supabase/migrations/0007`）。**法令最新値は要検証**（社労士確認）。
- 環境: ローカル/プレースホルダ開始。`.env.example` 参照。

## ディレクトリ構成

```
src/
  app/
    api/            … Route Handlers（仕様書 第8章）
    admin/ driver/ office/  … 画面（S-01〜S-14）
  lib/
    supabase/       … client(browser) / server / admin(service_role) / middleware
    compliance/     … 改善基準告示 計算・判定（最重要ロジック）
    line/           … signature / client(push) / flex / liff
    auth.ts time.ts datekey.ts validation.ts env.ts api/response.ts
  types/database.ts … 手書き暫定型（実DB接続後 `npm run db:types` で再生成）
supabase/
  migrations/0001〜0008  … スキーマ・RLS・Storage・設定初期値
  seed.sql              … 開発サンプルデータ
```

## コマンド

- `npm run dev` 開発サーバ / `npm run build` ビルド
- `npm run typecheck` 型チェック / `npm run lint`
- `npm run db:push` マイグレーション適用（要 Supabase 接続）
- `npm run db:types` DB から型生成（要ローカルDB or リンク済みプロジェクト）
- `npm run smoke` 全ルートの 5xx 検知（要 dev/start 稼働）/ `npm run test:all` 全結合テスト一括

> ⚠ **`next dev` 稼働中に `npm run build` を実行しない**こと。`.next` を共有するため
> 開発キャッシュが破損し `__webpack_modules__ is not a function` / `Cannot find module './xxx.js'` /
> segment-explorer 等のランタイムエラーになる。発生時は dev停止→`rm -rf .next`→dev再起動で復旧。
> ビルド検証は dev を止めてから行う。

## 重要な設計ルール

- **時刻は JST 固定**。月キー/日付キーは `src/lib/datekey.ts`、深夜判定は `src/lib/time.ts` の
  エポック+9h 演算で厳密化（仕様書 11.2 / 12.3 のゆれ解消）。
- **RLS 前提**。ドライバーは自分の行のみ、管理者は全件。サーバー内部処理のみ `admin.ts`（service_role）。
- **秘匿情報は環境変数のみ**（仕様書 12.1-#1）。LINE Webhook は署名検証必須（生ボディで検証）。
- **打刻は冪等**: `events.idempotency_key`（クライアント生成UUID, 4.3.4 優先キー方式）。
- 違反は **ソフト解消**（`compliance_alerts.status`）で監査証跡を保持（13章D）。

## 実装状況

基盤: プロジェクト雛形 / DBスキーマ+RLS / 認証基盤 / 改善基準告示calc / LINE基盤 / API / 画面導線。
接続: Supabase(ritaversesuoei-droid プロジェクト, link済・全migration適用済・型生成済) / GitHub(ritaversesuoei-droid/shoe-sys, SSH 443経由)。

機能（実装＋実DB検証済み）:
- 打刻パイプライン（F-02〜07）: `src/lib/operations/punch.ts`・`shift.ts`（二重打刻防止/連結/集計/違反判定）
- 日報フロー（F-10）: `src/lib/operations/daily-report.ts`（自動補完/保存/確定バリデーション）
- 日報PDF（F-17/18）: `src/lib/pdf/*`（B5 HTML→puppeteer-core→Storage署名URL）
- LINE通知（F-16）: `src/lib/line/notify.ts`（業務報告/違反警告, 未設定時スキップ）
- 運行ダッシュボード（F-15）: `src/lib/operations/board.ts`・`src/app/admin/page.tsx`（Realtime即時反映）
- 月次集計（F-14）: `src/lib/operations/monthly-summary.ts`・`src/app/admin/monthly`（出勤日数/拘束/労働/残業/休日/深夜/違反）
  ＋**祝日カレンダー連携**（`src/lib/holidays.ts`: 祝日法アルゴリズム＝固定/ハッピーマンデー/春分秋分/振替/国民の休日）。
  休日労働=休日(土日・祝日・手修正)の労働。**休日区分の手修正**（`PATCH /api/admin/holidays`＋月次画面）で即再計算。所定は `app_settings('payroll')`
- 確定時のサーバー側自動PDF生成（F-17/18）: 日報確定で休憩を勤務へ反映→`recomputeShift`で拘束/労働再計算→
  `src/lib/pdf/generate.ts`でPDF生成し `daily_reports.pdf_path` に記録
- 運行ルート○確認（4.6）: `daily_report_legs.confirmed`。確定時は全明細の○確認を必須（ドライバー画面にチェック）
- ドライバー打刻UI（S-02〜07）: `src/app/driver/*`・`src/components/driver/*`（位置取得/明細/アルコール/日報編集）
- 据置端末（S-08/09）: `src/lib/office.ts`・`src/app/api/office/*`・`src/components/office/*`（端末トークン認証で代行打刻）
- 逆ジオ・客先名推定（F-22）: `src/lib/geo/reverse.ts`（GSI/Google）・`src/lib/operations/customer.ts`。
  **`processPunch` に集約**し全打刻経路（API/据置端末/バッチ）で住所補完・客先推定が有効
- LINE Webhook（8.3）: `src/lib/line/webhook.ts`（友だち追加→連携案内 / 番号送信→`drivers.line_user_id`連携 / ブロック→解除）
- データ移行（第11章, **実データ投入済**）: `src/lib/migrate/*`（xlsx一括 `migrate:all`／打刻 `migrate:events`／5月 `migrate:editinput`）。
  現行ブックから drivers/vehicles/客先/shift_log/event_log/運行データ を投入し指標再計算（`migration/README.md`）

追加実装: 是正登録UI（F-13, `src/app/admin/warnings`）/ 拘束14h超「週2回まで」週次判定（`closeShift`）/
打刻写真アップロード（`src/lib/photo.ts`, event-photos バケット, RLS）。

検証/運用スクリプト（`npm run ...`）:
- 結合/単体テスト（実DBはデータ自動削除・全16スイートPASS / `test:all`）:
  `test:punch` `test:daily` `test:pdf` `test:line` `test:board` `test:monthly` `test:customer` `test:migrate`
  `test:warning` `test:weekly` `test:photo` `test:masters` `test:settings` `test:migrate-files` `test:holiday` `test:webhook`
  - server モジュールを読むテスト（`test:daily` `test:webhook`）は `--conditions=react-server` で本番同条件
- 運用: `provision:admin` `provision:driver`（アカウント作成）/ `migrate:all`（xlsx一括, MIGRATE_DIR/MIGRATE_RESET指定可）
- スクリプトは `node --env-file=.env.local --import tsx scripts/*.mts` 形式（tsx, @エイリアス解決）

残（要・外部入力 / 業務判断）:
- 改善基準告示の法令最新値・特例（分割休息/2人乗務/フェリー）… **社労士確認が必要**
- 実機ドライバーテストの前提: LINEチャネル/LIFF作成・公開デプロイ(HTTPS)・Webhook登録・DBパスワードのローテーション（詳細 `docs/deploy.md`）

詳細な設計判断は `docs/` を参照。
