-- 0015_compliance_special_cases.sql
-- app_settings('compliance') に特例パラメータ(special_cases)を投入し、
-- /admin/settings から社労士が調整できるようにする（未投入時はコード既定で補完される）。
-- 公知の2024年告示値。**判定へ反映する前に社労士確認のこと**。

update public.app_settings
set value = value || jsonb_build_object(
      'special_cases', jsonb_build_object(
        'two_person', jsonb_build_object('max_restraint_min', 1200, 'min_rest_period_min', 240),
        'split_rest', jsonb_build_object('min_segment_min', 180, 'min_total_min', 600, 'max_splits', 3),
        'ferry',      jsonb_build_object('credit_cap_min', 0)
      ))
where key = 'compliance'
  and not (value ? 'special_cases');
