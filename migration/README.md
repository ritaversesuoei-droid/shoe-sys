# データ移行（現行スプレッドシート → Supabase）

仕様書 第11章に基づく移行手順とツール。現行ブック（xlsx）を**直接読み込んで**一括投入する。

## かんたん手順（推奨・xlsx一括）

1. 現行の2ブックをそのまま `migration/input/` に置く（ファイル名は任意。シート名で自動判別）。
   - 勤怠ブック … `shift_log` / `drivers` / `vehicles` / `客先マスタ` / `event_log` / `修正入力` を含む
   - 運行ブック … `運行データ` を含む
2. 一括取込: **`npm run migrate:all`**
   - 順序: drivers → vehicles → 客先 → shift_log(shifts) → event_log(events) → 運行データ(dispatch) → 指標・違反 再計算
   - `MIGRATE_RESET=1 npm run migrate:all` で dispatch_plans を全削除してから投入。
3. 打刻履歴を別途取り込む場合: `npm run migrate:events`
4. shift_log に無い期間の勤怠を「修正入力」シートから補完: `npm run migrate:editinput`
5. 検証 — 件数・突合（`/admin/monthly`・`/admin/warnings` で現行値と照合）。

> 構造確認は `node --import tsx scripts/migrate/inspect-xlsx.mts`（各シートのヘッダ＋先頭行を表示）。

## シート → テーブル 対応

| シート | テーブル | 主な変換 |
| --- | --- | --- |
| `drivers` | drivers | code=driver_id（正式業務ID）, line_chat_url=line_ID, default_vehicle_no=car_No |
| `vehicles` | vehicles | vehicle_no, name=note, is_active=active_flag |
| `客先マスタ` | customers | name=荷主名, yago=荷主名（F-22 照合用） |
| `shift_log` | shifts | **確定出勤/確定退勤**を clock_in/out に採用（日跨ぎ確定済）。休憩・修正値も保持 |
| `event_log` | events / event_items | event_type(日本語)→enum、idempotency_key=event_id、shift_id は時刻で連結、積込/荷卸は明細化 |
| `修正入力` | shifts | 確定列が無いため時刻＋日跨ぎヒューリスティック（補完用、headerRow=3） |
| `運行データ` | dispatch_plans | 所属に「昭栄」を含まなければ子車。発地/着日/注意/順は note へ集約 |

## 設計上の扱い

- **自社/子車**: 会社名は「昭栄運輸」。所属に「昭栄」を含めば自社、含まなければ子車(`is_subcontract`)。
- **子車ドライバー**: `drivers` マスタには作らず `dispatch_plans.driver_name_raw` で表示（自社のみ `driver_id` 連結）。
  据置端末/管理マスタのドライバー選択を自社のみに保つため。
- **写真**: 現行は Google Drive 上のため移行対象外（URLのみ存在）。新システムでは Storage に保存。
- **daily_reports シート**: 実データ無し（移行対象なし）。
- **警告まとめ**: 違反は再計算で再現するため取込不要（是正コメントは未移行）。

## 冪等性

- `drivers` / `vehicles` … 自然キー（code / vehicle_no）で upsert（再実行安全）。
- `customers` … name の存在チェックで重複回避。
- `shifts` … (driver+work_date+clock_in_at) で重複回避。
- `events` … idempotency_key=event_id の存在チェックで重複回避。
- `dispatch_plans` … `MIGRATE_RESET=1` で全削除してから再投入。

## 検証

- 合成フィクスチャでの結合テスト: `npm run test:migrate-files`（13ケース）。
- クレンジング単体: `npm run test:migrate`。

## 旧CSV方式（任意）

シートを UTF-8 CSV で書き出して投入する個別コマンドも残置:
`npm run migrate:masters` / `migrate:shifts` / `migrate:dispatch`（列定義は `migration/templates/*.csv`）。

ロジックは `src/lib/migrate/`（`xlsx.ts` / `cleanse.ts` / `roster.ts` / `recompute.ts` /
`import-xlsx.ts` / `import-events.ts` / `import-shifts.ts` / `import-dispatch.ts`）に集約。
