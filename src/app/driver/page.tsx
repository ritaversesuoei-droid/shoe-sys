import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import { DriverLogin } from "@/components/driver/DriverLogin";
import { RestBanner } from "@/components/driver/RestBanner";

export const dynamic = "force-dynamic";

/**
 * ドライバーメニュー（S-02 / 仕様書 9.1）。未ログインはログイン画面。
 */
const ACTIONS: { key: string; label: string; href: string; tone?: string }[] = [
  { key: "departure", label: "出発", href: "/driver/punch/departure", tone: "bg-slate-900 text-white" },
  { key: "arrival", label: "到着報告", href: "/driver/punch/arrival" },
  { key: "loading", label: "積込完了", href: "/driver/punch/loading" },
  { key: "unloading", label: "荷卸完了", href: "/driver/punch/unloading" },
  { key: "leg_departure", label: "各駅出発", href: "/driver/punch/leg_departure" },
  { key: "rest", label: "☕ 休憩", href: "/driver/rest", tone: "bg-blue-600 text-white" },
  { key: "long_rest", label: "長距離休憩", href: "/driver/punch/long_rest" },
  { key: "clock_out", label: "退勤", href: "/driver/punch/clock_out", tone: "bg-orange-600 text-white" },
  { key: "report", label: "日報作成", href: "/driver/report" },
  { key: "history", label: "当日履歴", href: "/driver/history" },
];

export default async function DriverHome() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) return <DriverLogin />;

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">運行メニュー</h1>
        <span className="text-sm text-slate-500">{ctx.displayName ?? "ドライバー"}</span>
      </header>
      <RestBanner />
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className={`rounded-xl border border-slate-300 px-4 py-6 text-center text-lg font-medium active:scale-[0.98] ${
              a.tone ?? "bg-white"
            }`}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
