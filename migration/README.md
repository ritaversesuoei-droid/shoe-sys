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

## 勤怠（shift_log）・運行データの移行 — 実ファイル対応済み

現行スプレッドシートの2シートを UTF-8 CSV で書き出し、下記名で `migration/input/` に置く:

### `shifts.csv`（勤怠シート / 修正入力）
列順固定（先頭の「開始,日付,終了,日付」メタ行・空行はスキップし、`row_id` を含むヘッダ以降を処理）:
`開始日, ドライバー名, 実績出庫, 実績退勤, 修正出庫, 補正(出庫), 修正退勤, 補正(退勤), 休憩時間, 修正理由・備考, 状態, row_id`
- 実行: `npm run migrate:shifts`
- 処理: ドライバー名寄せ（無ければ `MGxxx` 暫定コードで作成）→ `shifts` 投入（修正値優先・退勤<出勤で翌日跨ぎ判定）→ **全勤務の改善基準告示 指標/違反を再計算**。
- 「データ無し」行（実績空）はスキップ。重複は (driver+work_date+実績出庫) で回避。

### `dispatch.csv`（運行データ）
`所属, ドライバー名, 携帯番号, 車両NO, 物込日, 荷主名, 物積(住所), 着荷日, 着荷地(会社名), 注意事項, 高速指示, 表示順`
- 実行: `npm run migrate:dispatch`（`MIGRATE_RESET=1` で既存を全削除してから投入）
- 処理: `dispatch_plans` 投入。所属に「庄栄」を含まなければ `is_subcontract=true`（子車）。発地/着日/注意/表示順は `note` へ集約。

### 検証
- 合成フィクスチャでの結合テスト: `npm run test:migrate-files`（13ケース）。
- クレンジング単体: `npm run test:migrate`。

> ドライバーの暫定コード `MGxxx` は `/admin/masters` で正式な2桁業務IDへ修正できる。
> 投入後は月次集計（`/admin/monthly`）・警告（`/admin/warnings`）で現行値と突合すること（11.2 手順4）。

クレンジング/変換は `src/lib/migrate/`（`cleanse.ts` / `roster.ts` / `recompute.ts` /
`import-shifts.ts` / `import-dispatch.ts`）に集約。
