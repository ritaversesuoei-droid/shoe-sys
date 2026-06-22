/**
 * 据置端末（事務所共用 / S-08, S-09 / 仕様書 9.1）。
 * 実装予定: 端末認証 → ドライバーID選択 → 出退勤打刻のみ（F-01, F-02, F-06）。
 * 本フェーズは雛形のみ。
 */
export default function OfficeHome() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-xl font-bold">据置端末</h1>
      <p className="text-sm text-slate-500">
        ドライバーID選択 → 出庫/退勤打刻（次フェーズで実装）。
      </p>
    </main>
  );
}
