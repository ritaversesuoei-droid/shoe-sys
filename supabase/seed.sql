-- ============================================================
-- 開発用シードデータ（supabase db reset 時に投入）
-- ============================================================
-- 注意: 認証ユーザー(auth.users)と profiles は Supabase Auth 経由で作成する。
--       ここでは業務マスタの最小サンプルのみ投入する。

-- 車両マスタ
insert into public.vehicles (vehicle_no, name, kind) values
  ('1001', '大型ウィング', '大型'),
  ('1002', '中型平', '中型'),
  ('2001', '子車A', '傭車')
on conflict (vehicle_no) do nothing;

-- ドライバーマスタ（code=2桁業務ID）
insert into public.drivers (code, name, default_vehicle_no, affiliation) values
  ('01', 'テスト 太郎', '1001', '自社'),
  ('02', 'テスト 次郎', '1002', '自社'),
  ('99', '傭車 三郎', '2001', '子車')
on conflict (code) do nothing;

-- 客先マスタ（F-22 学習元の初期サンプル）
insert into public.customers (postal_code, address, name, yago) values
  ('100-0001', '東京都千代田区千代田1-1', 'サンプル物流センター', 'サンプル物流')
on conflict do nothing;

-- 配車予定サンプル（当日テスト用に CURRENT_DATE を使用）
insert into public.dispatch_plans (plan_date, driver_id, vehicle_no, shipper, delivery_spot, highway_instruction)
select current_date, d.id, '1001', 'サンプル荷主', '東京都江東区', '高速可'
from public.drivers d where d.code = '01'
on conflict do nothing;
