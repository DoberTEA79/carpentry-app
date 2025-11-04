import React from "react";

/* ========== довідники ========== */
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

/* ========== типи, як в Оператора ========== */
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

/* ========== LS helpers ========== */
const LS_POOL = "orders_pool";
const LS_AUTH = "carpentry_auth";

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

/* 
  Нормалізація доступів.
  Бо в нас могло лежати "Конструктор", а ми перевіряємо "constructor".
*/
const PAGE_ALIASES: Record<string, string> = {
  // українські назви → ключі
  "Оператор": "operator",
  "Комплектовка": "kitting",
  "Майстер": "master",
  "Конструктор": "constructor",
  "Комірник": "store",
  "Куратор / Адмін": "curator",
  // на всяк випадок англійські — в самого себе
  operator: "operator",
  kitting: "kitting",
  master: "master",
  constructor: "constructor",
  store: "store",
  curator: "curator",
};

function normalizeAllowedPages(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (typeof x !== "string") return "";
      // обрізаємо пробіли
      const trimmed = x.trim();
      // якщо є в словнику — вертаємо ключ
      if (PAGE_ALIASES[trimmed]) return PAGE_ALIASES[trimmed];
      return trimmed; // хай буде як є
    })
    .filter(Boolean);
}

/* ========== дрібні хелпери ========== */
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

/* ========== сам компонент ========== */
export default function Constructor() {
  // 1) читаємо сесію
  const auth = React.useMemo(() => loadAuth(), []);

  // 2) нормалізуємо доступи
  const normalizedPages = normalizeAllowedPages(auth?.allowedPages || []);

  // 3) перевіряємо: або є "constructor", або роль адмінська
  const isAdmin =
    typeof auth?.role === "string" &&
    ["admin", "адмін", "Адмін", "куратор", "Куратор / Адмін"].some((r) =>
      auth.role.toLowerCase().includes(r.toLowerCase())
    );

  const allowed =
    isAdmin || normalizedPages.includes("constructor");

  if (!allowed) {
    return (
      <div className="p-6 text-center text-red-600">
        Немає доступу до «Конструктора».
      </div>
    );
  }

  /* ---- далі твій робочий код конструктора ---- */
  const [program, setProgram] = React.useState(1);
  const [plates, setPlates] = React.useState(1); // може бути 0.5
  const [loc, setLoc] = React.useState("W");
  const [raw, setRaw] = React.useState("");

  // розібрані рядки
  type Row = { index: string; qty: number };
  const rows: Row[] = React.useMemo(
    () =>
      raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const p = l.split(/\s+|\t|,|;|\|/).filter(Boolean);
          const idx = p[0] || "";
          const q = Number(p[1]);
          return { index: idx, qty: Number.isFinite(q) ? q : 0 };
        }),
    [raw]
  );

  // інфозона ДОЗ (фейкові дані)
  type ReorderRow = { id: string; source: "operator" | "kitting"; index: string; qty: number };
  const [reordersOperator] = React.useState<ReorderRow[]>([
    { id: "RO-1", source: "operator", index: "711C0018-XYZ", qty: 3 },
    { id: "RO-2", source: "operator", index: "721C0012-AAA", qty: 2 },
  ]);
  const [reordersKitting] = React.useState<ReorderRow[]>([
    { id: "RK-1", source: "kitting", index: "716C0016-BBB", qty: 5 },
    { id: "RK-2", source: "kitting", index: "715C0016-CCC", qty: 1 },
  ]);
  const [reorderTab, setReorderTab] = React.useState<"all" | "operator" | "kitting">("all");
  const reorderList = React.useMemo(() => {
    const all = [...reordersOperator, ...reordersKitting];
    if (reorderTab === "operator") return all.filter((r) => r.source === "operator");
    if (reorderTab === "kitting") return all.filter((r) => r.source === "kitting");
    return all;
  }, [reordersOperator, reordersKitting, reorderTab]);

  // матеріал з 1 індексу
  const material = React.useMemo(() => {
    if (!rows.length) return "";
    const first = rows[0].index;
    const key = Object.keys(MATERIAL_FROM_INDEX).find((k) => first.startsWith(k));
    return key ? MATERIAL_FROM_INDEX[key] : "";
  }, [rows]);

  // дата/час
  const now = new Date();
  const week = pad2(isoWeek(now));
  const day = String(isoWeekday(now));
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, "0");

  // у назві карти показуємо те, що ввів конструктор (навіть 0.5)
  const cardName = `P${pad2(program)}_${material || "??"}_${plates}Pl_${loc}_${week}${day}_${hh}.${mm}`;

  // в замовлення — не менше 1 плити
  const effPlates = plates >= 1 ? plates : 1;

  const totalPieces = React.useMemo(
    () => rows.reduce((s, r) => s + r.qty * Math.max(1, effPlates), 0),
    [rows, effPlates]
  );

  const [isWorking, setIsWorking] = React.useState(false);
  const [lastOrder, setLastOrder] = React.useState<any | null>(null);

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

    // агрегація індексів
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
    };

    const pool = load<OperatorOrder[]>(LS_POOL, []);
    pool.unshift(order);
    save(LS_POOL, pool);

    setLastOrder({ ...order });
    setProgram((p) => (typeof p === "number" ? p + 1 : Number(p || 0) + 1));
    setRaw("");
    setIsWorking(false);
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* верхня панель створення карти */}
      <section className="col-span-12 bg-white rounded-2xl shadow ring-1 ring-black/5 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 order-1 sm:order-none">
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
          <h2 className="text-lg font-medium">Створення карти</h2>
        </div>

        {lastOrder && (
          <div className="mt-3 rounded-xl bg-green-50 border border-green-200 text-green-800 px-3 py-2 text-sm">
            Відправлено в <b>Замовлення</b>: {lastOrder.items.length} позицій, карта{" "}
            <span className="font-mono">{lastOrder.fileName}</span>.
          </div>
        )}

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
            <p className="text-xs text-neutral-400 mt-1">&lt;1 плити → в замовлення піде 1 плита</p>
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

      {/* нижня частина — без змін */}
      <section className="col-span-12 bg-white rounded-2xl shadow ring-1 ring-black/5 p-5">
        <div className="grid grid-cols-12 md:gap-6 gap-5">
          {/* ДОзамовлення (інфо) */}
          <div className="col-span-12 md:col-span-5 md:order-1">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium">ДОзамовлення</h3>
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
