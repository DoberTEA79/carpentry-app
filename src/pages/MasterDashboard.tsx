import React, { useEffect, useMemo, useState } from "react";

/** =========================
 *  LS keys (узгоджено з іншими сторінками)
 *  ========================= */
const LS_ORDERS_DB   = "orders_db_v1";   // Оператори (карти)
const LS_KITTING_DB  = "kitting_db_v1";  // Комплектовка (S_D item)
const LS_AX          = "AX_buffer";      // Буфер у Комірника (плюсом)
const LS_DOZ         = "DOZ_buffer";     // Дозамовлення (мінус у AX)

type BoardFormat = { id: string; name: string; material?: string; thickness?: number; size?: string };
const LS_BOARDS = "board_formats_db_v1"; // база форматів плит (її заповнює Куратор)

type OrderStatus = "pool" | "taken" | "in_progress" | "done";
type OperatorOrder = {
  id: string;
  fileName: string;
  plates: number;
  items: { index: string; qtyPerCard: number }[];
  status: OrderStatus;
  assignee?: string;
  createdAt: string;
  takenAt?: string;
  startedAt?: string;
  closedAt?: string;

  /** НОВЕ: зберігаємо вибір типу плити з Оператора */
  boardFormatId?: string;
};

type KStatus = "pool" | "taken" | "in_progress" | "done";
type KittingOrder = {
  id: string;
  sdItem: string;
  qtyPlan: number;
  location: string;
  status: KStatus;
  assignee?: string;
  priority?: number;
  createdAt: string;
  takenAt?: string;
  startedAt?: string;
  closedAt?: string;
};

type MapNum = Record<string, number>;

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save<T>(key: string, val: T){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function genId(prefix="K"): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }

function fmtDate(d?: string){ return d ? new Date(d).toLocaleString() : ""; }
function inRange(ts: string, from?: string, to?: string){
  if (!ts) return false;
  const t = +new Date(ts);
  if (from && t < +new Date(from)) return false;
  if (to && t > +new Date(to)) return false;
  return true;
}
function itemTotal(plates:number, qtyPerCard:number){
  const p = Math.max(1, Number(plates)||1);
  const q = Math.max(0, Number(qtyPerCard)||0);
  return p*q;
}

/** =========================
 *  Статичні дані
 *  ========================= */
const LOCS = [
  { code: "W",  label: "Височка" },
  { code: "P",  label: "Потуліца" },
  { code: "S",  label: "Дивани" },
  { code: "A",  label: "Боки" },
  { code: "B",  label: "Броди" },
];

/** =========================
 *  Переклад статусів (UI-рівень)
 *  ========================= */
const K_STATUS_LABEL: Record<KStatus, string> = {
  pool:        "В пулі",
  taken:       "Взято",
  in_progress: "В роботі",
  done:        "Готово",
};
const K_STATUS_BADGE: Record<KStatus, string> = {
  pool:        "bg-neutral-100 text-neutral-700",
  taken:       "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-900",
  done:        "bg-emerald-100 text-emerald-800",
};

/** =========================
 *  Dashboard
 *  ========================= */
export default function MasterDashboardPage(){
  // БД
  const [opsDb, setOpsDb]       = useState<OperatorOrder[]>(() => load<OperatorOrder[]>(LS_ORDERS_DB, []));
  const [kitDb, setKitDb]       = useState<KittingOrder[]>(() => load<KittingOrder[]>(LS_KITTING_DB, []));
  const [axBuf, setAxBuf]       = useState<MapNum>(() => load<MapNum>(LS_AX, {}));
  const [dozBuf, setDozBuf]     = useState<MapNum>(() => load<MapNum>(LS_DOZ, {}));

  // База форматів плит Куратора (live)
  const [boards, setBoards]     = useState<BoardFormat[]>(() => load<BoardFormat[]>(LS_BOARDS, []));
  useEffect(() => {
    function onStorage(e: StorageEvent){
      if (e.key === LS_ORDERS_DB) setOpsDb(load<OperatorOrder[]>(LS_ORDERS_DB, []));
      if (e.key === LS_KITTING_DB) setKitDb(load<KittingOrder[]>(LS_KITTING_DB, []));
      if (e.key === LS_AX) setAxBuf(load<MapNum>(LS_AX, {}));
      if (e.key === LS_DOZ) setDozBuf(load<MapNum>(LS_DOZ, {}));
      if (e.key === LS_BOARDS) setBoards(load<BoardFormat[]>(LS_BOARDS, []));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** ===== Tabs ===== */
  const [tab, setTab] = useState<"overview"|"reports"|"kitting_orders">("overview");

  /** ===== KPI / Overview ===== */
  const kpi = useMemo(() => {
    const opsInWork   = opsDb.filter(o => o.status==="taken" || o.status==="in_progress").length;
    const opsDone     = opsDb.filter(o => o.status==="done").length;
    const kitInWork   = kitDb.filter(o => o.status==="taken" || o.status==="in_progress").length;
    const kitDone     = kitDb.filter(o => o.status==="done").length;

    const axMinusDoz = (() => {
      const idxs = new Set([...Object.keys(axBuf), ...Object.keys(dozBuf)]);
      let total = 0;
      idxs.forEach(k => { total += (Number(axBuf[k])||0) - (Number(dozBuf[k])||0); });
      return total;
    })();

    return { opsInWork, opsDone, kitInWork, kitDone, axMinusDoz };
  }, [opsDb, kitDb, axBuf, dozBuf]);

  /** ===== Reports (with date range) ===== */
  const [from, setFrom] = useState<string>("");
  const [to, setTo]     = useState<string>("");

  // Оператори: групуємо закриті карти у діапазоні дат
  const opsReport = useMemo(() => {
    const rows = opsDb.filter(o => o.status==="done" && inRange(o.closedAt!, from, to));
    const map: Record<string, { cards: number; pieces: number }> = {};
    for (const o of rows){
      const name = o.assignee || "—";
      const pieces = o.items.reduce((s,it)=> s + itemTotal(o.plates, it.qtyPerCard), 0);
      if (!map[name]) map[name] = { cards: 0, pieces: 0 };
      map[name].cards += 1;
      map[name].pieces += pieces;
    }
    const list = Object.entries(map).map(([assignee, v]) => ({ assignee, ...v }));
    list.sort((a,b)=> b.pieces - a.pieces || b.cards - a.cards || a.assignee.localeCompare(b.assignee));
    return { rows: list, totalCards: rows.length, totalPieces: list.reduce((s,r)=>s+r.pieces,0) };
  }, [opsDb, from, to]);

  // Комплектовка: групуємо закриті у діапазоні
  const kitReport = useMemo(() => {
    const rows = kitDb.filter(o => o.status==="done" && inRange(o.closedAt!, from, to));
    const map: Record<string, { orders: number; qty: number }> = {};
    for (const o of rows){
      const name = o.assignee || "—";
      if (!map[name]) map[name] = { orders: 0, qty: 0 };
      map[name].orders += 1;
      map[name].qty += Math.max(0, Number(o.qtyPlan)||0);
    }
    const list = Object.entries(map).map(([assignee, v]) => ({ assignee, ...v }));
    list.sort((a,b)=> b.qty - a.qty || b.orders - a.orders || a.assignee.localeCompare(b.assignee));
    return { rows: list, totalOrders: rows.length, totalQty: list.reduce((s,r)=>s+r.qty,0) };
  }, [kitDb, from, to]);

  // Плити: сумуємо кількість плит за закритими картами у діапазоні дат
  const boardReport = useMemo(() => {
    const closed = opsDb.filter(o => o.status === "done" && inRange(o.closedAt!, from, to));
    const agg: Record<string, number> = {};
    for (const o of closed) {
      const key = o.boardFormatId || "__none__";
      const count = Math.max(0, Number(o.plates) || 0);
      agg[key] = (agg[key] ?? 0) + count;
    }
    const nameOf = (id: string) =>
      id === "__none__" ? "— не вибрано —" : (boards.find(b => b.id === id)?.name || id);

    const rows = Object.entries(agg).map(([id, plates]) => ({ id, name: nameOf(id), plates }));
    rows.sort((a, b) => b.plates - a.plates || a.name.localeCompare(b.name));
    const total = rows.reduce((s, r) => s + r.plates, 0);
    return { rows, total };
  }, [opsDb, boards, from, to]);

  /** ===== Master: publish Kitting orders (the “sheet” inside dashboard) ===== */
  const [loc, setLoc]      = useState("W");
  const [bulk, setBulk]    = useState("");
  const [priority, setPri] = useState<number>(0);

  function parseBulk(text: string): { sdItem: string; qtyPlan: number }[] {
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const rows: { sdItem: string; qtyPlan: number }[] = [];
    for (const l of lines) {
      const parts = l.split(/[,\t;| ]+/).filter(Boolean);
      const item = parts[0] || "";
      const q = Number(parts[1]);
      if (!item) continue;
      rows.push({ sdItem: item, qtyPlan: Number.isFinite(q) ? q : 0 });
    }
    return rows;
  }
  function aggregate(rows: { sdItem: string; qtyPlan: number }[]) {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (!r.sdItem) continue;
      map[r.sdItem] = (map[r.sdItem] ?? 0) + (Number(r.qtyPlan) || 0);
    }
    return Object.entries(map).map(([sdItem, qtyPlan]) => ({ sdItem, qtyPlan }))
      .sort((a,b)=> a.sdItem.localeCompare(b.sdItem));
  }

  const parsed     = useMemo(()=> parseBulk(bulk), [bulk]);
  const aggregated = useMemo(()=> aggregate(parsed), [parsed]);

  function publishOrders(){
    if (aggregated.length === 0) { alert("Немає рядків для публікації."); return; }
    const now = new Date().toISOString();
    const toCreate: KittingOrder[] = aggregated.map(r => ({
      id: genId("K"),
      sdItem: r.sdItem,
      qtyPlan: Math.max(0, Number(r.qtyPlan)||0),
      location: loc,
      status: "pool",
      priority: Number(priority)||0,
      createdAt: now,
    }));
    setKitDb(prev => {
      const next = [...toCreate, ...prev];
      save(LS_KITTING_DB, next);
      return next;
    });
    setBulk("");
  }

  /** ===== UI ===== */
  return (
    <div className="space-y-6">
      {/* Top tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Майстер — Dashboard</h1>
        <div className="bg-neutral-100 rounded-xl p-1 text-sm">
          <button onClick={()=>setTab("overview")} className={`px-3 py-1.5 rounded-lg ${tab==='overview'?'bg-white shadow':''}`}>Огляд</button>
          <button onClick={()=>setTab("reports")} className={`px-3 py-1.5 rounded-lg ${tab==='reports'?'bg-white shadow':''}`}>Звіти</button>
          <button onClick={()=>setTab("kitting_orders")} className={`px-3 py-1.5 rounded-lg ${tab==='kitting_orders'?'bg-white shadow':''}`}>Замовлення для Комплектовки</button>
        </div>
      </div>

      {/* Overview */}
      {tab==='overview' && (
        <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <KPI title="Оператор — в роботі" value={kpi.opsInWork}/>
          <KPI title="Оператор — готово (всього)" value={kpi.opsDone}/>
          <KPI title="Комплектовка — в роботі" value={kpi.kitInWork}/>
          <KPI title="Комплектовка — готово (всього)" value={kpi.kitDone}/>
          <KPI title="AX (плюс − ДОЗ) — разом шт." value={kpi.axMinusDoz}/>
        </section>
      )}

      {/* Reports */}
      {tab==='reports' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm text-neutral-600">Від</label>
              <input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1"/>
            </div>
            <div>
              <label className="block text-sm text-neutral-600">До</label>
              <input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1"/>
            </div>
            <button onClick={()=>{ setFrom(""); setTo(""); }} className="h-9 px-3 rounded-lg border border-neutral-300 hover:bg-neutral-50">Скинути фільтр</button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Operators */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-medium">Оператори — підсумок (закриті карти)</h3>
              <div className="text-xs text-neutral-500 mt-1">Групування: виконавець → карт/деталей у вибраному діапазоні.</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-neutral-500">
                    <tr className="border-b">
                      <th className="py-2 px-3 w-12">#</th>
                      <th className="py-2 px-3">Оператор</th>
                      <th className="py-2 px-3 w-28">Карт</th>
                      <th className="py-2 px-3 w-28">Деталей</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsReport.rows.length===0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-neutral-500">Немає даних.</td></tr>
                    )}
                    {opsReport.rows.map((r,i)=>(
                      <tr key={r.assignee} className="border-b">
                        <td className="py-2 px-3">{i+1}</td>
                        <td className="py-2 px-3">{r.assignee}</td>
                        <td className="py-2 px-3">{r.cards}</td>
                        <td className="py-2 px-3">{r.pieces}</td>
                      </tr>
                    ))}
                  </tbody>
                  {opsReport.rows.length>0 && (
                    <tfoot>
                      <tr className="border-t bg-neutral-50">
                        <td className="py-2 px-3" />
                        <td className="py-2 px-3 text-right font-medium">Разом:</td>
                        <td className="py-2 px-3 font-bold">{opsReport.totalCards}</td>
                        <td className="py-2 px-3 font-bold">{opsReport.totalPieces}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Boards */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-medium">Плити — підсумок (закриті карти)</h3>
              <div className="text-xs text-neutral-500 mt-1">
                Групування за форматом плити з бази Куратора. Береться кількість плит із кожної закритої карти.
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-neutral-500">
                    <tr className="border-b">
                      <th className="py-2 px-3 w-12">#</th>
                      <th className="py-2 px-3">Формат плити</th>
                      <th className="py-2 px-3 w-28">Плит (шт.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardReport.rows.length === 0 && (
                      <tr><td colSpan={3} className="py-6 text-center text-neutral-500">Немає даних.</td></tr>
                    )}
                    {boardReport.rows.map((r, i) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 px-3">{i + 1}</td>
                        <td className="py-2 px-3">{r.name}</td>
                        <td className="py-2 px-3">{r.plates}</td>
                      </tr>
                    ))}
                  </tbody>
                  {boardReport.rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-neutral-50">
                        <td className="py-2 px-3" />
                        <td className="py-2 px-3 text-right font-medium">Разом:</td>
                        <td className="py-2 px-3 font-bold">{boardReport.total}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Kitting */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-medium">Комплектовка — підсумок (закриті)</h3>
              <div className="text-xs text-neutral-500 mt-1">Групування: виконавець → замовлень/шт. у вибраному діапазоні.</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-neutral-500">
                    <tr className="border-b">
                      <th className="py-2 px-3 w-12">#</th>
                      <th className="py-2 px-3">Комплектувальник</th>
                      <th className="py-2 px-3 w-28">Замовлень</th>
                      <th className="py-2 px-3 w-28">Шт.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kitReport.rows.length===0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-neutral-500">Немає даних.</td></tr>
                    )}
                    {kitReport.rows.map((r,i)=>(
                      <tr key={r.assignee} className="border-b">
                        <td className="py-2 px-3">{i+1}</td>
                        <td className="py-2 px-3">{r.assignee}</td>
                        <td className="py-2 px-3">{r.orders}</td>
                        <td className="py-2 px-3">{r.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                  {kitReport.rows.length>0 && (
                    <tfoot>
                      <tr className="border-t bg-neutral-50">
                        <td className="py-2 px-3" />
                        <td className="py-2 px-3 text-right font-medium">Разом:</td>
                        <td className="py-2 px-3 font-bold">{kitReport.totalOrders}</td>
                        <td className="py-2 px-3 font-bold">{kitReport.totalQty}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Kitting Orders sheet inside Dashboard */}
      {tab==='kitting_orders' && (
        <section className="space-y-4">
          {/* Панель управління */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-neutral-600">Локація</label>
            <select value={loc} onChange={e=>setLoc(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1">
              {LOCS.map(l => <option key={l.code} value={l.code}>{l.code} — {l.label}</option>)}
            </select>
            <label className="text-sm text-neutral-600 ml-2">Пріоритет</label>
            <input type="number" value={priority} onChange={e=>setPri(Number(e.target.value)||0)} className="w-24 rounded-lg border border-neutral-300 px-2 py-1"/>
            <button onClick={publishOrders} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Опублікувати в Замовлення</button>
          </div>

          {/* Форма вводу + попередній перегляд */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-medium">Ввід (S_D item та к-ть)</h3>
              <p className="text-sm text-neutral-500 mt-1">Формат: <code className="bg-neutral-100 px-1 rounded">S_D&nbsp;item Qty</code> (розділювачі: пробіл / таб / , / ; / |)</p>
              <textarea
                rows={10}
                value={bulk}
                onChange={e=>setBulk(e.target.value)}
                className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm"
                placeholder={`Напр.:\nSOFA-001 2\nSOFA-002 1\nCHAIR-10,5`}
              />
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-medium">Попередній перегляд (агреговано)</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-neutral-500">
                    <tr className="border-b">
                      <th className="py-2 px-3 w-12">#</th>
                      <th className="py-2 px-3">S_D item</th>
                      <th className="py-2 px-3 w-28">К-ть план</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregated.length===0 && (
                      <tr><td colSpan={3} className="py-6 text-center text-neutral-500">Порожньо</td></tr>
                    )}
                    {aggregated.map((r,i)=>(
                      <tr key={r.sdItem} className="border-b">
                        <td className="py-2 px-3">{i+1}</td>
                        <td className="py-2 px-3 font-mono">{r.sdItem}</td>
                        <td className="py-2 px-3">{r.qtyPlan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-neutral-500 mt-2">Для кожного рядка створюється окреме замовлення у статусі “В пулі”.</div>
            </div>
          </div>

          {/* Швидкий огляд БД по локації */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">На зараз у БД Комплектовки</h3>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-500">
                  <tr className="border-b">
                    <th className="py-2 px-3 w-12">#</th>
                    <th className="py-2 px-3">S_D item</th>
                    <th className="py-2 px-3 w-24">К-ть</th>
                    <th className="py-2 px-3 w-24">Локація</th>
                    <th className="py-2 px-3 w-28">Статус</th>
                    <th className="py-2 px-3 w-40">Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {kitDb.length===0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Порожньо</td></tr>
                  )}
                  {kitDb.map((o,i)=>(
                    <tr key={o.id} className="border-b">
                      <td className="py-2 px-3">{i+1}</td>
                      <td className="py-2 px-3 font-mono">{o.sdItem}</td>
                      <td className="py-2 px-3">{o.qtyPlan}</td>
                      <td className="py-2 px-3">{o.location}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${K_STATUS_BADGE[o.status]}`}>
                          {K_STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="py-2 px-3">{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </section>
      )}
    </div>
  );
}

/** ============== дрібний UI ============== */
function KPI({title, value}:{title:string; value:number}){
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="text-xs text-neutral-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
