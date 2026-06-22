/**
 * ドライバーメニュー（S-02 / 仕様書 9.1）。
 * 実装予定: LIFF初期化→/api/auth/line でセッション確立→打刻メニュー（F-02〜F-10）。
 * 本フェーズは導線の雛形のみ。
 */
export default function DriverHome() {
  const actions = [
    { key: "departure", label: "出発" },
    { key: "arrival", label: "到着報告" },
    { key: "loading", label: "積込完了" },
    { key: "unloading", label: "荷卸完了" },
    { key: "clock_out", label: "退勤（通常）" },
    { key: "long_rest", label: "長距離休憩" },
    { key: "leg_departure", label: "各駅出発" },
    { key: "report", label: "日報作成" },
  ];
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-xl font-bold">運行メニュー</h1>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <button
            key={a.key}
            className="rounded-xl border border-slate-300 bg-white px-4 py-6 text-center font-medium active:bg-slate-100"
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-400">
        ※ 雛形画面です。打刻フォーム（F-02〜F-10）は次フェーズで実装します。
      </p>
    </main>
  );
}
