"use client";

import { useEffect, useState } from "react";

interface Driver {
  id: string;
  code: string;
  name: string;
  default_vehicle_no: string | null;
}

type Step = "keypad" | "confirm" | "action";

/**
 * 据置端末（事務所共用 / S-08, S-09）。
 * 現行GAS受付端末に合わせたフロー: テンキーで2桁ID → 本人確認 → ☀出勤 / 🌙退勤。
 * 端末トークンで一度だけ解錠（以後 localStorage 保持）。代行打刻は出勤(departure)/退勤(clock_out)のみ。
 */
export function OfficeTerminal() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState<Step>("keypad");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<Driver | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("office_token");
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/office/drivers", { headers: { "x-office-token": token } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDrivers(d.drivers);
        else {
          setError(d.error ?? "取得失敗");
          localStorage.removeItem("office_token");
          setToken(null);
        }
      })
      .catch((e) => setError(String(e)));
  }, [token]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("office_token", tokenInput);
    setToken(tokenInput);
    setError(null);
  }

  function resetToKeypad() {
    setStep("keypad");
    setCode("");
    setSelected(null);
    setError(null);
  }

  // テンキー入力
  function pressDigit(d: string) {
    setError(null);
    setCode((c) => (c.length >= 3 ? c : c + d));
  }
  function clearCode() {
    setError(null);
    setCode("");
  }
  function backspace() {
    setError(null);
    setCode((c) => c.slice(0, -1));
  }

  // ID確定 → ドライバー照合
  function enterCode() {
    if (!code) return;
    const target = (drivers ?? []).find(
      (d) => d.code != null && Number(d.code) === Number(code),
    );
    if (!target) {
      setError(`ID「${code}」のドライバーが見つかりません`);
      return;
    }
    setSelected(target);
    setStep("confirm");
  }

  async function punch(eventType: "departure" | "clock_out") {
    if (!selected || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/office/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-office-token": token },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          driver_id: selected.id,
          event_type: eventType,
          vehicle_no: selected.default_vehicle_no || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setToast(`${selected.name} さん：${eventType === "departure" ? "出勤" : "退勤"} を記録しました`);
      resetToKeypad();
      setTimeout(() => setToast(null), 2800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- 解錠画面 ----
  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
        <h1 className="text-center text-2xl font-bold">🔑 据置端末 解錠</h1>
        <form onSubmit={unlock} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="端末トークン"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-4 text-center text-lg"
          />
          {error && <p className="text-center text-base text-red-600">{error}</p>}
          <button className="rounded-xl bg-slate-900 px-4 py-4 text-lg font-bold text-white">解錠する</button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-sm p-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">昭栄運輸 出退勤</h1>
        <button
          onClick={() => {
            localStorage.removeItem("office_token");
            setToken(null);
          }}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500"
        >
          🔒
        </button>
      </header>

      {toast && (
        <p className="mb-3 rounded-xl bg-green-100 p-4 text-center text-lg font-bold text-green-800">✅ {toast}</p>
      )}

      {drivers === null ? (
        <p className="py-20 text-center text-lg text-slate-400">読込中...</p>
      ) : step === "keypad" ? (
        // ---- テンキー（DRIVER'S ID） ----
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 text-center text-xs font-bold tracking-widest text-amber-600">DRIVER&apos;S ID</div>
          <div className="mb-3 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex h-16 w-12 items-center justify-center rounded-lg border-2 border-slate-300 bg-slate-50 text-3xl font-bold"
              >
                {code[i] ?? ""}
              </div>
            ))}
          </div>

          {error && <p className="mb-2 rounded bg-red-50 p-2 text-center text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                onClick={() => pressDigit(d)}
                className="rounded-xl border border-slate-200 bg-slate-50 py-5 text-2xl font-bold active:scale-95 active:bg-slate-200"
              >
                {d}
              </button>
            ))}
            <button onClick={clearCode} className="rounded-xl border border-slate-200 bg-slate-100 py-5 text-lg font-bold text-slate-500 active:scale-95">
              CLR
            </button>
            <button onClick={() => pressDigit("0")} className="rounded-xl border border-slate-200 bg-slate-50 py-5 text-2xl font-bold active:scale-95 active:bg-slate-200">
              0
            </button>
            <button onClick={backspace} className="rounded-xl border border-slate-200 bg-slate-100 py-5 text-2xl font-bold text-slate-500 active:scale-95">
              ⌫
            </button>
          </div>

          <button
            onClick={enterCode}
            disabled={!code}
            className="mt-3 w-full rounded-xl bg-red-600 py-4 text-xl font-extrabold text-white active:scale-[0.99] disabled:opacity-40"
          >
            ENTER
          </button>
        </div>
      ) : step === "confirm" && selected ? (
        // ---- 本人確認 ----
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 text-center text-sm text-slate-400">No.{selected.code}</div>
          <p className="mb-6 text-center text-2xl font-bold">
            {selected.name} さん<br />ですね？
          </p>
          <button
            onClick={() => setStep("action")}
            className="w-full rounded-2xl bg-amber-400 py-6 text-2xl font-extrabold text-slate-900 active:scale-[0.99]"
          >
            はい！
          </button>
          <button onClick={resetToKeypad} className="mt-3 w-full rounded-xl bg-slate-100 py-3 text-base text-slate-600">
            戻る
          </button>
        </div>
      ) : step === "action" && selected ? (
        // ---- 出勤 / 退勤 ----
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-center text-lg font-bold">{selected.name} さん</div>
          {error && <p className="mb-3 rounded bg-red-50 p-2 text-center text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-4">
            <button
              onClick={() => punch("departure")}
              disabled={busy}
              className="rounded-2xl bg-blue-600 py-8 text-3xl font-extrabold text-white active:scale-[0.99] disabled:opacity-50"
            >
              ☀ 出勤
            </button>
            <button
              onClick={() => punch("clock_out")}
              disabled={busy}
              className="rounded-2xl bg-red-600 py-8 text-3xl font-extrabold text-white active:scale-[0.99] disabled:opacity-50"
            >
              🌙 退勤
            </button>
          </div>
          <button onClick={resetToKeypad} disabled={busy} className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-base text-slate-600">
            キャンセル
          </button>
        </div>
      ) : null}
    </main>
  );
}
