# データ移行（現行スプレッドシート → Supabase）

仕様書 第11章に基づく移行手順とツール。

## 手順（11.2 移行方式）

1. **CSVエクスポート** — 現行スプレッドシート（勤怠用・運車用）の各シートをCSV出力。
2. **配置** — `migration/input/` に下記ファイル名で置く（`templates/` の列定義に合わせる）。
3. **クレンジング＋投入** — `npm run migrate:masters`（マスタ系）。
   - 表記ゆれ（全半角・GMT文字列混在・スペース/カンマ）は `src/lib/migrate/cleanse.ts` で吸収。
4. **検証** — 件数・突合（現行値との差分）。
5. **並行稼働**（任意）— 一定期間 両系へ流し差分検証。

## 入力ファイル（`migration/input/`）

| ファイル | 移行先テーブル | 主な列 |
| --- | --- | --- |
| `drivers.csv` | drivers | code, name, line_user_id, default_vehicle_no, affiliation |
| `vehicles.csv` | vehicles | vehicle_no, name, kind |
| `customers.csv` | customers | postal_code, address, name, yago |
| `dispatch_plans.csv` | dispatch_plans | plan_date, driver_code, driver_name, vehicle_no, shipper, delivery_spot, highway_instruction, is_subcontract |

列テンプレートは `migration/templates/*.csv` を参照（ヘッダ＋サンプル行）。

## 冪等性

- `drivers` / `vehicles` … 自然キー（code / vehicle_no）で upsert（再実行安全）。
- `customers` / `dispatch_plans` … 存在チェックで重複回避。

## events / shifts / daily_reports の移行（次工程）

現行 `event_log` / `shift_log` / `daily_reports` は列番号ベース・1セル多値・日跨ぎ補正など
現行実装依存が強いため、本書 11.1 マッピングに沿った専用変換が必要:

- `event_log` → `events`（改行区切り多値は `splitMultiValue` で `event_items` へ分割）
- `shift_log` → `shifts`（列番号→列名マッピング表を作成）
- `daily_reports`（1行1明細）→ `daily_reports` + `daily_report_legs` + `daily_report_rests`
- 警告まとめ → `compliance_alerts`（shift IDで紐付け）
- 投入後、全 shift の改善基準告示指標を **再計算**（`src/lib/compliance` / `src/lib/operations/shift.ts`）し、
  現行値と突合（11.2 手順4）。

クレンジング関数（`toHankaku` / `parseDateLoose` / `parseDateTimeLoose` / `parseNumberLoose` /
`splitMultiValue` / `parseCsv`）は `src/lib/migrate/cleanse.ts` に集約済み。検証は `npm run test:migrate`。
