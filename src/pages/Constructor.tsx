import React from "react";

/* ===== довідник матеріалів ===== */
const MATERIAL_FROM_INDEX: Record<string, string> = {
  "721C0004": "Skl4",
  "721C0006": "Skl6",
  "721C0012": "Skl12",
  "721C0015": "Skl15",
  "721C0018": "Skl18",
  "711C0015": "W15",
  "711C0018": "W18",
  "711C0025": "W25",
  "714C0016": "WW16",
  "716C0016": "WB16",
  "713C0018": "WB18",
  "715C0016": "WA16",
  "771C0012": "OSB",
  "781C0015": "VSkl15",
};

const LOCS = [
  { code: "B", label: "Броди" },
  { code: "W", label: "Височка" },
  { code: "P", label: "Потуліца" },
  { code: "S", label: "Дивани" },
  { code: "A", label: "Боки" },
  { code: "D", label: "Дозамовлення" },
  { code: "ST", label: "Стандартна" },
];

/* ===== типи як в Оператора ===== */
type OrderItem = { index: string; qtyPerCard: number };
export type OperatorOrder = {
  id: string;
  fileName: string;
  plates: number;
  items: OrderItem[];
  status: "pool" | "taken" | "in_progress" | "done";
  assignee?: string;
  priority?: number;
  createdAt: string;
  takenAt?: string;
  startedAt?: string;
  closedAt?: string;
};

/* ===== LS ===== */
const LS_POOL = "orders_pool";
const LS_AUTH = "carpentry_auth";
const LS_DOZ_OP = "DOZ_operator"; // що пише Оператор при закритті
const LS_DOZ_KIT = "DOZ_buffer";  // що пише комплектовка / комірник

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function makeId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || "null");
  } catch {
    return null;
  }
}

/* ===== дрібні ===== */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function isoWeekday(d: Date) {
  const n = d.getDay();
  return n === 0 ? 7 : n;
}

/* ======================= */
export default function Constructor() {
  /* ---- доступ ---- */
  const auth = React.useMemo(() => loadAuth(), []);
  const allowed =
    !!auth && Array.isArray(auth.allowedPages) && auth.allowedPages.includes("constructor");
  if (!allowed) {
    return <div className="p-6 text-center text-red-600">Немає доступу до «Конструктора».</div>;
  }

  /* ---- стани ---- */
  const [program, setProgram] = React.useState(1);
  const [plates, setPlates] = React.useState(1);
  const [loc, setLoc] = React.useState("W");
  const [raw, setRaw] = React.useState("");

  // пріоритет: 1=по плану, 2=треба, 3=терміново
  const [priority, setPriority] = React.useState<1 | 2 | 3>(1);

  // розібрані рядки
  type Row = { index: string; qty: number };
  const rows: Row[] = React.useMemo(
    () =>
      raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const parts = l.split(/\s+|\t|,|;|\|/).filter(Boolean);
          const idx = (parts[0] || "").trim();
          const q = Number(parts[1]);
          return { index: idx, qty: Number.isFinite(q) ? q : 0 };
        }),
    [raw]
  );

  // ====== реальні ДОЗамовлення з localStorage ======
  // обидві структури — це просто { "index": кількість }
  const [dozOperator, setDozOperator] = React.useState<Record<string, number>>(() =>
    load<Record<string, number>>(LS_DOZ_OP, {})
  );
  const [dozKitting, setDozKitting] = React.useState<Record<string, number>>(() =>
    load<Record<string, number>>(LS_DOZ_KIT, {})
  );

  // слухаємо зміни з інших вкладок
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_DOZ_OP) setDozOperator(load<Record<string, number>>(LS_DOZ_OP, {}));
      if (e.key === LS_DOZ_KIT) setDozKitting(load<Record<string, number>>(LS_DOZ_KIT, {}));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

function clearDoz() {
    if (!confirm("Очистити всі ДОзамовлення?")) return;
    save(LS_DOZ_OP, {});
    save(LS_DOZ_KIT, {});
    setDozOperator({});
    setDozKitting({});
  }

  // готуємо список для таблиці
  type ReorderView = { id: string; source: "operator" | "kitting"; index: string; qty: number };
  const [reorderTab, setReorderTab] = React.useState<"all" | "operator" | "kitting">("all");
  const reorderList = React.useMemo(() => {
    const op: ReorderView[] = Object.entries(dozOperator).map(([idx, q]) => ({
      id: `op-${idx}`,
      source: "operator",
      index: idx,
      qty: q,
    }));
    const kit: ReorderView[] = Object.entries(dozKitting).map(([idx, q]) => ({
      id: `kit-${idx}`,
      source: "kitting",
      index: idx,
      qty: q,
    }));
    const all = [...op, ...kit];
    if (reorderTab === "operator") return op;
    if (reorderTab === "kitting") return kit;
    return all;
  }, [dozOperator, dozKitting, reorderTab]);

  // матеріал з першого індексу
  const material = React.useMemo(() => {
    if (!rows.length) return "";
    const first = (rows[0].index || "").trim();
    if (!first) return "";
    const key = Object.keys(MATERIAL_FROM_INDEX).find((k) => first.startsWith(k));
    return key ? MATERIAL_FROM_INDEX[key] : "";
  }, [rows]);

  // дата/час
  const now = new Date();
  const week = pad2(isoWeek(now));
  const day = String(isoWeekday(now));
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, "0");

  // назва карти
  const cardName = `P${pad2(program)}_${material || "??"}_${plates}Pl_${loc}_${week}${day}_${hh}.${mm}`;

  // мінімум 1 плита в замовленні
  const effPlates = plates >= 1 ? plates : 1;

  const totalPieces = React.useMemo(
    () => rows.reduce((s, r) => s + r.qty * Math.max(1, effPlates), 0),
    [rows, effPlates]
  );

  const [isWorking, setIsWorking] = React.useState(false);
  const [lastOrder, setLastOrder] = React.useState<OperatorOrder | null>(null);

  function copyName() {
    if (navigator.clipboard) navigator.clipboard.writeText(cardName);
  }

  function sendToWork() {
    if (!rows.length) {
      alert('Додай хоча б один рядок "index qty"');
      return;
    }
    if (isWorking) return;
    setIsWorking(true);

    // агрегація
    const agg: Record<string, number> = {};
    for (const r of rows) {
      if (!r.index) continue;
      const q = Number.isFinite(r.qty) ? r.qty : 0;
      agg[r.index] = (agg[r.index] || 0) + q;
    }

    const cleanItems: OrderItem[] = Object.keys(agg)
      .map((k) => ({ index: k, qtyPerCard: agg[k] }))
      .filter((it) => it.index && it.qtyPerCard > 0);

    const order: OperatorOrder = {
      id: makeId(),
      fileName: cardName,
      plates: effPlates,
      items: cleanItems,
      status: "pool",
      createdAt: new Date().toISOString(),
      priority,
    };

    const pool = load<OperatorOrder[]>(LS_POOL, []);
    pool.unshift(order);
    save(LS_POOL, pool);

    setLastOrder(order);
    setProgram((p) => (typeof p === "number" ? p + 1 : Number(p || 0) + 1));
    setRaw("");
    setIsWorking(false);
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ВЕРХНІЙ БЛОК */}
      <section className="col-span-12 bg-white rounded-2xl shadow ring-1 ring-black/5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={copyName}
              title="Копіювати назву"
              className="px-3 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50"
            >
              📋
            </button>
            <div className="font-mono text-sm bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 select-all">
              {cardName}
            </div>
            <button
              onClick={sendToWork}
              disabled={isWorking}
              className={`ml-2 px-4 py-2 rounded-xl ${
                isWorking ? "bg-blue-300 text-white cursor-wait" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isWorking ? "Відправляю…" : "В РОБОТУ"}
            </button>
          </div>

          {/* пріоритети */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Пріоритет:</span>
            <div className="bg-neutral-100 rounded-xl p-1 flex gap-1">
              <button
                onClick={() => setPriority(3)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  priority === 3 ? "bg-red-500 text-white" : "bg-white"
                }`}
              >
                Терміново
              </button>
              <button
                onClick={() => setPriority(2)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  priority === 2 ? "bg-amber-400 text-white" : "bg-white"
                }`}
              >
                Треба зробити
              </button>
              <button
                onClick={() => setPriority(1)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  priority === 1 ? "bg-blue-500 text-white" : "bg-white"
                }`}
              >
                По плану
              </button>
            </div>
          </div>
        </div>

        {lastOrder && (
          <div className="mt-3 rounded-xl bg-green-50 border border-green-200 text-green-800 px-3 py-2 text-sm">
            Відправлено в <b>Замовлення</b>: {lastOrder.items.length} позицій, карта{" "}
            <span className="font-mono">{lastOrder.fileName}</span>.
          </div>
        )}

        {/* форма */}
        <div className="grid md:grid-cols-12 gap-3 mt-4">
          <div className="md:col-span-2">
            <label className="text-sm text-neutral-600">P (№ програми)</label>
            <input
              type="number"
              min={1}
              value={program}
              onChange={(e) => setProgram(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-neutral-600">Плити (xPl)</label>
            <input
              type="number"
              step="0.1"
              min={0.1}
              value={plates}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPlates(Number.isFinite(v) ? Math.max(0.1, v) : 0.1);
              }}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
            <p className="text-xs text-neutral-400 mt-1">
              &lt;1 плити → в замовлення піде 1 плита
            </p>
          </div>
          <div className="md:col-span-3">
            <label className="text-sm text-neutral-600">Локація</label>
            <select
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            >
              {LOCS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} — {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-neutral-600">Матеріал (з 1-го індексу)</label>
            <input
              value={material}
              readOnly
              placeholder="—"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-sm text-neutral-600">Тиждень+день | Час</label>
            <div className="flex gap-2">
              <input
                value={`${week}${day}`}
                readOnly
                className="w-24 rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50"
              />
              <input
                value={`${hh}.${mm}`}
                readOnly
                className="w-24 rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50"
              />
            </div>
          </div>
        </div>
      </section>

      {/* НИЗ */}
            {/* нижня частина — як у тебе */}
            {/* нижня частина — як у тебе */}
      <section className="col-span-12 bg-white rounded-2xl shadow ring-1 ring-black/5 p-5">
        <div className="grid grid-cols-12 md:gap-6 gap-5">
          {/* ДОзамовлення (інфо) */}
          <div className="col-span-12 md:col-span-5 md:order-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium">Дозамовлення</h3>
                <button
                  onClick={clearDoz}
                  className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Очистити
                </button>
              </div>
              <div className="bg-neutral-100 rounded-xl p-1 text-sm">
                <button
                  onClick={() => setReorderTab("all")}
                  className={`px-2 py-1 rounded-lg ${reorderTab === "all" ? "bg-white shadow" : ""}`}
                >
                  Всі
                </button>
                <button
                  onClick={() => setReorderTab("operator")}
                  className={`px-2 py-1 rounded-lg ${reorderTab === "operator" ? "bg-white shadow" : ""}`}
                >
                  Оператори
                </button>
                <button
                  onClick={() => setReorderTab("kitting")}
                  className={`px-2 py-1 rounded-lg ${reorderTab === "kitting" ? "bg-white shadow" : ""}`}
                >
                  Комплектовка
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-sm text-neutral-500">
                    <th className="px-3 py-2">Index</th>
                    <th className="px-3 py-2">К-ть</th>
                    <th className="px-3 py-2">Звідки</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderList.map((r) => (
                    <tr key={r.id} className="bg-neutral-50">
                      <td className="px-3 py-2 font-mono">{r.index}</td>
                      <td className="px-3 py-2">{r.qty}</td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`px-2 py-1 rounded-full ${
                            r.source === "operator"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {r.source === "operator" ? "Оператор" : "Комплектовка"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {reorderList.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-6 text-center text-neutral-500 border border-dashed border-neutral-300 rounded-xl"
                      >
                        Поки що порожньо.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-neutral-500">* Інформаційна зона.</div>
          </div>

          {/* Дані карти */}
          <div className="col-span-12 md:col-span-7 md:order-2">
            <h3 className="text-base font-medium">Дані карти: Index + Кількість</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Вставляй рядки у форматі: <code className="bg-neutral-100 px-1 rounded">Index Qty</code>
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-2xl border border-neutral-300 px-3 py-2 font-mono text-sm"
              placeholder={`Напр.:\n711C0018-XYZ 12\n721C0012-AAA 6`}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-sm text-neutral-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Index</th>
                    <th className="px-3 py-2">К-ть на карті</th>
                    <th className="px-3 py-2">Плит</th>
                    <th className="px-3 py-2">Всього</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.index}-${i}`} className="bg-neutral-50">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 font-mono">{r.index}</td>
                      <td className="px-3 py-2">{r.qty}</td>
                      <td className="px-3 py-2">{plates}</td>
                      <td className="px-3 py-2 font-medium">{r.qty * Math.max(1, effPlates)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-neutral-500 border border-dashed border-neutral-300 rounded-xl"
                      >
                        Поки що порожньо.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-neutral-600">
              Разом деталей (× плити): <b>{totalPieces}</b>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

