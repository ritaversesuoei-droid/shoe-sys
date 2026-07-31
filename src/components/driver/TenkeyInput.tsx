"use client";

import { useState } from "react";

/**
 * 専用テンキー付き入力。欄をタップすると画面下からテンキーが出る。
 *   スマホ標準の数字キーボードは「−」を出せないため、0-9・「.」・「−」・⌫ を備えた自前キーパッドにする。
 *   readOnly にして標準キーボードは出さず、キーパッドのみで入力する。
 */
export function TenkeyInput({
  value,
  onChange,
  placeholder,
  className,
  allowDot = true,
  allowMinus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  allowDot?: boolean;
  allowMinus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const push = (ch: string) => onChange(value + ch);
  const back = () => onChange(value.slice(0, -1));

  const Key = ({ label, onTap, variant }: { label: string; onTap: () => void; variant?: "num" | "sub" | "done" }) => (
    <button
      type="button"
      onClick={onTap}
      className={`rounded-xl py-4 text-2xl font-bold active:scale-95 ${
        variant === "done"
          ? "bg-slate-900 text-white"
          : variant === "sub"
            ? "bg-slate-200 text-slate-700"
            : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <input
        readOnly
        value={value}
        placeholder={placeholder}
        onClick={() => setOpen(true)}
        className={`${className ?? ""} cursor-pointer`}
      />
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full rounded-t-2xl bg-slate-100 p-3 pb-5" onClick={(e) => e.stopPropagation()}>
            {/* 入力中の値 */}
            <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
              <span className="text-sm font-bold text-slate-400">{placeholder || "入力"}</span>
              <span className="text-2xl font-black text-slate-900">{value || "—"}</span>
              <button type="button" onClick={() => onChange("")} className="text-sm font-bold text-blue-600">クリア</button>
            </div>
            {/* キーパッド */}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <Key key={n} label={n} onTap={() => push(n)} />
              ))}
              <Key label="−" onTap={() => (allowMinus ? push("-") : undefined)} variant={allowMinus ? "num" : "sub"} />
              <Key label="0" onTap={() => push("0")} />
              <Key label="." onTap={() => (allowDot ? push(".") : undefined)} variant={allowDot ? "num" : "sub"} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Key label="⌫ 削除" onTap={back} variant="sub" />
              <Key label="完了" onTap={() => setOpen(false)} variant="done" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
