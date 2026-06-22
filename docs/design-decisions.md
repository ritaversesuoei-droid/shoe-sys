# 設計判断と仕様対応

要件定義書の各論点に対する本実装の判断・対応箇所をまとめる。

## 第13章 未決事項の決定

| # | 論点 | 決定 | 反映箇所 |
| --- | --- | --- | --- |
| A | ドライバー認証 | LINEログイン(LIFF)主体 + 据置端末併用 | `api/auth/line`, `lib/line/liff.ts`, `office/` |
| B | 改善基準告示ロジック | **最新法令準拠で再設計**（ヒアリング確定）。閾値は構成管理 | `lib/compliance/*`, `migrations/0007` |
| C | 積込の複数値 | 子テーブル `event_items`（1打刻=1件・最大3明細） | `migrations/0003`, `events` API |
| D | 違反の解消 | ソフト解消（`status=resolved`）で監査証跡保持 | `compliance_alerts`, `warnings/:id/correction` |
| E | リアルタイム性 | Supabase Realtime（次フェーズでクライアント購読） | `admin/board` API（盤面データ） |
| F | 運車予定の取込 | `dispatch_plans` テーブル + 名寄せ列。CSV/API取込は次フェーズ | `migrations/0005` |
| G | PDF生成方式 | Puppeteer（既定）。本フェーズ未導入、次フェーズで生成器 | `reports/.../pdf`（501） |
| H | オフライン対応 | PWA + キューイング（次フェーズ） | — |

## 第12章 現行課題への対応

| # | 課題 | 対応 | 反映箇所 |
| --- | --- | --- | --- |
| 1 | LINEトークン平文ハードコード | 環境変数のみ。`getServerEnv()` で server 限定参照 | `lib/env.ts`, `lib/line/*` |
| 2 | admin/office が URL 既知で誰でも閲覧可 | Supabase Auth + RLS + ロール（`profiles`） | `migrations/0006`, `middleware.ts`, `lib/auth.ts` |
| 3 | Webhook 署名検証なし | `X-Line-Signature` 検証を必須化（生ボディHMAC） | `lib/line/signature.ts`, `line/webhook` |
| 4 | 写真がリンク既知で閲覧可 | 非公開バケット + 署名付きURL | `migrations/0008` |
| 5 | 判定が固定15hで法令と不整合 | パラメータを `app_settings` 化、法令準拠で再設計 | `migrations/0007`, `lib/compliance` |
| 6 | LINEカウンタの暦月またぎ事故 | 月キー付きカウンタ + アトミック加算RPC | `line_usage`, `increment_line_usage` |
| 7 | 1セル改行多値詰め | `event_items` へ正規化 | `migrations/0003` |
| 8 | 列番号マジックナンバー | 列名アクセス（リレーショナル化） | スキーマ全般 |
| 9 | 「10分以内・同種別」上書きで正当打刻を握り潰し | 冪等キー方式（`idempotency_key` UUID） | `events`, `events` API |
| 10 | 休息/日跨ぎ/長距離の前後マッピング破綻 | 勤務連結ロジックを明示実装（次フェーズで完全版）+ `edited_*_adj_days` | `shifts`, `lib/compliance` |
| 12.3 | 時刻ユーティリティ二重定義・"0:00"/"00:00"ゆれ | `lib/time.ts` に単一・正規実装へ統一 | `lib/time.ts` |

## 機能(F-xx) → 実装 対応

| F | 機能 | 実装箇所（本フェーズ） |
| --- | --- | --- |
| F-01 | 認証・ログイン | `api/auth/line`, `admin/login`, `lib/auth.ts` |
| F-02〜F-07 | 打刻系 | `api/events`（共通パイプライン）, `lib/validation.ts` |
| F-08 | 当日履歴 | `api/events/today` |
| F-09 | 当日予定 | `api/dispatch-plans/today` |
| F-10 | 日報作成/保存 | `api/daily-reports`（読込実装・保存は次フェーズ） |
| F-11 | 勤怠自動集計 | `lib/compliance/calculate.ts` |
| F-12/F-13 | 違反判定・是正 | `lib/compliance`, `api/admin/warnings*` |
| F-14 | 月次集計 | `api/admin/monthly-summary`（次フェーズ） |
| F-15 | 運行盤面 | `api/admin/board`, `admin/` |
| F-16 | LINE通知 | `lib/line/client.ts`, `lib/line/flex.ts` |
| F-17/F-18 | 帳票PDF | `api/reports/.../pdf`（次フェーズ Puppeteer） |
| F-19 | 時刻修正 | `api/admin/shifts/[id]`（再計算込み） |
| F-20 | 通知残数 | `api/admin/line-usage`, `line_usage` |
| F-21 | 前回メーター | `api/vehicles/[no]/last-meter` |
| F-22 | 客先名学習 | `customers` テーブル（推定ロジックは次フェーズ） |

## 改善基準告示（要・法令検証）

`app_settings('compliance')`（`migrations/0007`）に 2024年4月施行のトラック向け基準を出発点として設定:
1日拘束 原則13h/上限15h、月284h・年3300h（労使協定 310h/3400h）、休息 継続11h・下限9h、
運転時間 2日平均9h・2週平均44h、連続運転4h（中断10分/合計30分）、深夜 22:00-05:00。

> これらは実装の初期値であり、**特例（分割休息・2人乗務・フェリー）や最新条文の確認は未反映**。
> 運用前に社労士・最新告示で必ず検証し、`app_settings` を更新すること。
