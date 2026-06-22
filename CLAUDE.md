# CLAUDE.md — 庄栄運輸 運行・勤怠管理システム

このファイルは Claude Code（および開発者）向けのプロジェクト指針です。

## 概要

ダンプ運送事業者「庄栄運輸」向けの運行・勤怠管理 Web アプリ。
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

## 重要な設計ルール

- **時刻は JST 固定**。月キー/日付キーは `src/lib/datekey.ts`、深夜判定は `src/lib/time.ts` の
  エポック+9h 演算で厳密化（仕様書 11.2 / 12.3 のゆれ解消）。
- **RLS 前提**。ドライバーは自分の行のみ、管理者は全件。サーバー内部処理のみ `admin.ts`（service_role）。
- **秘匿情報は環境変数のみ**（仕様書 12.1-#1）。LINE Webhook は署名検証必須（生ボディで検証）。
- **打刻は冪等**: `events.idempotency_key`（クライアント生成UUID, 4.3.4 優先キー方式）。
- 違反は **ソフト解消**（`compliance_alerts.status`）で監査証跡を保持（13章D）。

## 実装状況（このフェーズ＝基盤）

完了: プロジェクト雛形 / DBスキーマ+RLS / 認証基盤 / 改善基準告示calc / LINE基盤 / API雛形 / 画面導線。

次フェーズ（TODO、コード内に `TODO(...)` で明示）:
- 打刻パイプライン完全版（二重打刻防止 4.3.3 / shift連結 / 逆ジオコーディング / 通知 / 集計）
- 日報の自動補完・保存（4.6）と確定→PDF（F-17, Puppeteer）
- 月次集計（F-14）/ 運行盤面 Realtime（F-15）
- 移行スクリプト（第11章: スプレッドシート→Postgres）

詳細な設計判断は `docs/` を参照。
