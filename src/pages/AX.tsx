import React, { useEffect, useMemo, useState } from "react";

/** ===== LocalStorage keys ===== */
const LS_AX = "AX_buffer";

/** ===== helpers ===== */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toCsv(rows: Array<{ index: string; qty: number }>) {
  const header = ["Index", "Qty"];
  const body = rows.map((r) => [r.index, String(r.qty)]);
  const lines = [header, ...body].map((arr) =>
    arr
      .map((v) => {
        const s = String(v ?? "");
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",")
  );
  return lines.join("\n");
}

/** ===== Page ===== */
export default function AXPage() {
  // версія для форс-оновлення після очищення
  const [ver, setVer] = useState(0);

  // читаємо ТІЛЬКИ AX_buffer
  const axMap = useMemo(() => load<Record<string, number>>(LS_AX, {}), [ver]);

  // в таблицю: тільки >0, від’ємні/нульові не показуємо
  const rows = useMemo(() => {
    return Object.entries(axMap)
      .map(([index, qty]) => ({ index, qty: Number(qty) || 0 }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.index.localeCompare(b.index));
  }, [axMap]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.qty, 0), [rows]);

  function clearAX() {
    localStorage.removeItem(LS_AX); // повністю очистити буфер
    setVer((v) => v + 1);
  }

  function exportCsvAndClear() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    a.href = url;
    a.download = `AX_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // після експорту — очищаємо
    clearAX();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Комірник — AX</div>
        <div className="flex gap-2">
          <button
            onClick={exportCsvAndClear}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Зберегти в Excel (CSV) і очистити
          </button>
          <button
            onClick={clearAX}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50"
          >
            Очистити AX
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b">
              <th className="py-2 px-3 w-12">#</th>
              <th className="py-2 px-3">Index</th>
              <th className="py-2 px-3 w-40 text-right">К-ть</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-neutral-500">
                  Поки що порожньо.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.index} className="border-b">
                <td className="py-2 px-3">{i + 1}</td>
                <td className="py-2 px-3 font-mono">{r.index}</td>
                <td className="py-2 px-3 text-right font-medium">{r.qty}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr>
                <td />
                <td className="py-2 px-3 text-right font-medium">Разом:</td>
                <td className="py-2 px-3 text-right font-bold">{total}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-500">
        Дані формуються з буфера <b>AX</b>, який наповнюється при закритті карт у
        Оператора (кількість по карті мінус ДОЗ). На цій сторінці додаткове
        віднімання ДОЗ не виконується.
      </div>
    </div>
  );
}
