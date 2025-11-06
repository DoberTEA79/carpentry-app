import React, { useEffect, useMemo, useState } from "react";

/* ============================
   Типи
   ============================ */
type OrderStatus = "pool" | "taken" | "in_progress" | "done";

const STATUS_LABEL_OP: Record<OrderStatus, string> = {
  pool: "В пулі",
  taken: "Взято",
  in_progress: "В роботі",
  done: "Готово",
};

const STATUS_COLOR_OP: Record<OrderStatus, "gray" | "blue" | "amber" | "green"> = {
  pool: "gray",
  taken: "blue",
  in_progress: "amber",
  done: "green",
};

type BoardFormat = {
  id: string;
  name: string;
  material?: string;
  thickness?: number;
  size?: string;
};
const LS_BOARDS = "board_formats_db_v1";

/** Мапа визначення матеріалу за початком індексу */
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

export type OrderItem = {
  index: string;
  qtyPerCard: number; // к-ть на карті (для 1 плити)
};

export type OperatorOrder = {
  id: string;
  fileName: string;     // назва карти
  plates: number;       // к-сть плит (xPl)
  items: OrderItem[];   // індекси з к-стю на карті
  status: OrderStatus;
  assignee?: string;    // username з login
  priority?: number;
  createdAt: string;
  takenAt?: string;
  startedAt?: string;
  closedAt?: string;
  printedAt?: string;   // позначка, що наклейки вже друкували
  /** НОВЕ: вибраний формат плити з бази Куратора */
  boardFormatId?: string;
};

export type DozamRow = { index: string; qty: number };

/* ============================
   Ключі LocalStorage (єдине місце)
   ============================ */
const LS_DB              = "orders_db_v1";           // ЄДИНА база всіх замовлень
const LS_POOL_LEGACY     = "orders_pool";            // легасі-пул від Конструктора (для міграції)
const LS_AX              = "AX_buffer";              // буфер Комірника/Майстрів
const LS_DOZ_OP          = "DOZ_operator";           // ДОЗ від Оператора (для Конструктора)
const LS_POOL_SEEN_TS    = "orders_pool_seen_ts";    // час останнього «перегляду пулу»
const LS_OPERATOR_TAB    = "operator_active_tab";    // активна вкладка оператора
const LS_AUTH            = "carpentry_auth";         // сесія користувача
const LS_POOL_BUMP       = "orders_pool_bump";

/* ============================
   LocalStorage helper-и
   ============================ */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, val: T){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

/* агрегатор: сумує значення по індексу */
export function sumByIndex(rows: { index: string; qty: number }[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const key = (r.index || "").trim();
    if (!key) continue;
    acc[key] = (acc[key] ?? 0) + (Number(r.qty) || 0);
  }
  return acc;
}

/* к-ть штук по індексу з урахуванням плит */
export function toAXRows(order: OperatorOrder): { index: string; qty: number }[] {
  const mult = Math.max(1, order.plates || 1);
  return order.items.map(it => ({ index: it.index, qty: (it.qtyPerCard || 0) * mult }));
}

/* Визначити матеріал карти за першим індексом */
function detectMaterial(order: OperatorOrder): string | undefined {
  const first = order.items?.[0]?.index || "";
  const key = Object.keys(MATERIAL_FROM_INDEX).find(k => first.startsWith(k));
  return key ? MATERIAL_FROM_INDEX[key] : undefined;
}
function materialHintByFirstIndex(order: OperatorOrder): string | undefined {
  return detectMaterial(order);
}

/* ============================
   UI дрібниці
   ============================ */
function Badge({children, color}:{children: React.ReactNode; color: "blue"|"amber"|"green"|"gray"}){
  const cls = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-neutral-50 text-neutral-700 border-neutral-200",
  }[color];
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${cls}`}>{children}</span>;
}
 
function btnColorByPriority(p?: number) {
  if (p === 3) {
    // терміново
    return "bg-red-600 hover:bg-red-700";
  }
  if (p === 2) {
    // треба зробити
    return "bg-amber-500 hover:bg-amber-600";
  }
  // по плану / немає
  return "bg-blue-600 hover:bg-blue-700";
}

/* ============================
   Друк наклейок (100×30)
   ============================ */
function itemTotal(plates:number, qtyPerCard:number){
  const p = Math.max(1, Number(plates)||1);
  const q = Math.max(0, Number(qtyPerCard)||0);
  return p * q;
}
function buildPrintHTML(order: OperatorOrder, operatorName: string) {
  const dateStr = new Date(order.startedAt || Date.now()).toLocaleString();
  const labels: string[] = [];

  // головне місце: тепер проходимо просто по items
  order.items.forEach((it, idx) => {
    const seq = idx + 1; // №1, №2, ...
    const id = `bc_${idx}_${Math.random().toString(36).slice(2,6)}`;

    labels.push(`
      <div class="label">
        <div class="row top">
          <div class="index">${it.index}</div>
          <div class="seq">№ ${seq}</div>
        </div>
        <div class="barcode-wrap">
          <svg id="${id}" class="barcode"></svg>
        </div>
        <div class="meta">
          <span class="card">${order.fileName}</span>
          <span class="op">${operatorName}</span>
          <span class="dt">${dateStr}</span>
        </div>
        <div class="hidden-code" data-code="${it.index}"></div>
      </div>
    `);
  });

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Print labels</title>
    <style>
      @page { size: 100mm 30mm; margin: 0; }
      html, body { margin:0; padding:0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: system-ui, sans-serif; }
      .label { width: 100mm; height: 30mm; box-sizing: border-box; padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
      .row.top { display:flex; align-items:center; justify-content:space-between; }
      .index { font-weight: 700; font-size: 12pt; letter-spacing: 0.5px; }
      .seq { font-weight: 600; font-size: 11pt; }
      .barcode-wrap { width: 100%; height: 13mm; display:flex; align-items:center; }
      .barcode { width: 100%; height: 100%; }
      .meta { display:flex; gap:6px; font-size: 8pt; color:#111; align-items:center; }
      .meta .card { font-weight:600; }
    </style>
  </head>
  <body>
    ${labels.join('\n')}
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <script>
      (function(){
        function init(){
          document.querySelectorAll('.hidden-code').forEach(function(el){
            var code = el.getAttribute('data-code');
            var svg = el.parentElement.querySelector('svg.barcode');
            if (code && svg){
              try { JsBarcode(svg, code, {format:'CODE128', displayValue:false, margin:0, height:48}); } catch(e){}
            }
          });
          setTimeout(function(){ window.print(); }, 300);
        }
        if (document.readyState === 'complete' || document.readyState === 'interactive') init();
        else document.addEventListener('DOMContentLoaded', init);
      })();
    </script>
  </body>
  </html>`;
}


function openPrint(order: OperatorOrder, operatorName: string) {
  // sorted copy
  const sorted = {
    ...order,
    items: [...order.items].sort((a,b)=> a.index.localeCompare(b.index))
  };

  const html = buildPrintHTML(sorted, operatorName);
  const win = window.open("", "_blank");
  if (!win) { alert("Дозвольте відкривати вікна для друку."); return; }
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  win.focus();
}

/* ============================
   Основна сторінка
   ============================ */
export default function OperatorPage(){

  // База форматів плит від Куратора (читання + live оновлення)
  const [boardFormats, setBoardFormats] = useState<BoardFormat[]>(
    () => load<BoardFormat[]>(LS_BOARDS, [])
  );
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_BOARDS) setBoardFormats(load<BoardFormat[]>(LS_BOARDS, []));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // хто залогінений
  const auth = useMemo(()=>{
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || "null"); } catch { return null; }
  }, []);
  const username = auth?.username || "operator";

  // Єдина БД
  const [db, setDb] = useState<OperatorOrder[]>(() => load<OperatorOrder[]>(LS_DB, []));

  // Автозбереження
  useEffect(()=> save(LS_DB, db), [db]);

  // Міграція зі старого пулу (якщо Конструктор скидав у orders_pool)
  useEffect(() => {
    function mergeOnce() {
      const legacy = load<OperatorOrder[]>(LS_POOL_LEGACY, []);
      if (!legacy.length) return;
      setDb(prev => {
        const seen = new Set(prev.map(o => o.id));
        const added = legacy.filter(o => !seen.has(o.id));
        return added.length ? [...added, ...prev] : prev;
      });
    }

    mergeOnce(); // стартом

    function onStorage(e: StorageEvent) {
      if (e.key === LS_POOL_LEGACY || e.key === LS_POOL_BUMP) mergeOnce();
    }
    window.addEventListener("storage", onStorage);

    function onVisible(){ if (!document.hidden) mergeOnce(); }
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(mergeOnce, 2000);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  // Похідні списки
  const pool = useMemo(() => db.filter(o => o.status === "pool"), [db]);
  const mine = useMemo(() => db.filter(o => o.assignee === username), [db, username]);

  // Вкладка
  const [tab, setTab] = useState<"pool"|"mine">(() => load(LS_OPERATOR_TAB, "pool" as "pool"|"mine"));
  useEffect(()=> save(LS_OPERATOR_TAB, tab), [tab]);

  // «Підсвічування» нових замовлень у пулі
  const [hasNew, setHasNew] = useState(false);
  useEffect(()=>{
    const lastSeen = Number(load(LS_POOL_SEEN_TS, 0));
    const newest = pool.length ? Math.max(...pool.map(o => new Date(o.createdAt).getTime())) : 0;
    setHasNew(newest > lastSeen);
  }, [pool]);

  useEffect(()=>{
    if (tab === "pool") {
      const newest = pool.length ? Math.max(...pool.map(o => new Date(o.createdAt).getTime())) : Date.now();
      save(LS_POOL_SEEN_TS, newest);
      setHasNew(false);
    }
  }, [tab, pool]);

  // Disclosure для «вмісту карти»
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggleOpen = (id:string)=> setOpen(prev=> ({...prev, [id]: !prev[id]}));

  // Допоміжне: (не фільтрую, щоб вибір був завжди; просто можна винести «свій» матеріал в текст під селектом)
  function formatsForOrder(_o: OperatorOrder) {
    return boardFormats || [];
  }

  /* --- ДІЇ --- */
  function takeOrder(id: string){
    setDb(prev => prev.map(o => o.id===id && o.status==='pool'
      ? { ...o, status: "taken", assignee: username, takenAt: new Date().toISOString() }
      : o));
  }

  // Старт: запускаємо і ОДНОРАЗОВО відкриваємо друк, якщо ще не друкували
  function startOrder(id: string){
    setDb(prev => {
      const target = prev.find(o => o.id === id && o.assignee === username);
      const next = prev.map(o =>
        o.id === id && o.assignee === username && (o.status === "taken" || o.status === "in_progress")
          ? {
              ...o,
              status: "in_progress",
              startedAt: o.startedAt || new Date().toISOString(),
              printedAt: o.printedAt || new Date().toISOString(),
            }
          : o
      );
      if (target && !target.printedAt) {
        setTimeout(() => openPrint(target, username), 0);
      }
      return next;
    });
  }

  /* Закриття: оновити AX (плюс по карті мінус ДОЗ) + записати ДОЗ у DOZ_operator */
  function applyClose(order: OperatorOrder, doz: DozamRow[]){
    const axRows = toAXRows(order);

    const dozClean = doz
      .map(r => ({ index: (r.index||"").trim(), qty: Number(r.qty)||0 }))
      .filter(r => r.index && r.qty > 0);
    const dozSum = sumByIndex(dozClean);

    const axBuf = load<Record<string, number>>(LS_AX, {});
    for (const r of axRows) { axBuf[r.index] = (axBuf[r.index] ?? 0) + r.qty; }
    for (const [idx, q] of Object.entries(dozSum)) { axBuf[idx] = (axBuf[idx] ?? 0) - q; }
    save(LS_AX, axBuf);

    const dozBuf = load<Record<string, number>>(LS_DOZ_OP, {});
    for (const [idx, q] of Object.entries(dozSum)) { dozBuf[idx] = (dozBuf[idx] ?? 0) + q; }
    save(LS_DOZ_OP, dozBuf);

    setDb(prev => prev.map(o => o.id===order.id && o.assignee===username
      ? { ...o, status: "done", closedAt: new Date().toISOString() }
      : o));
  }

  // Модалка Закрити
  const [closing, setClosing] = useState<OperatorOrder|null>(null);
  const [dozRows, setDozRows]   = useState<DozamRow[]>([{ index:"", qty:0 }]);
  function addRow(){ setDozRows(r=>[...r,{index:"",qty:0}]); }
  function rmRow(i:number){ setDozRows(r=> r.filter((_,idx)=>idx!==i)); }
  function updRow(i:number, patch:Partial<DozamRow>){ setDozRows(r=> r.map((row,idx)=> idx===i? { ...row, ...patch } : row)); }

  function confirmClose(){
    if (!closing) return;
    const toClose = closing;
    setClosing(null);
    const payload = dozRows;
    setDozRows([{ index:"", qty:0 }]);
    applyClose(toClose, payload);
  }

  /* ============================
     Render
     ============================ */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Оператор — Замовлення</div>
        <div className="flex gap-2">
          <button
            onClick={()=>setTab("pool")}
            className={`px-3 py-1.5 rounded-lg border relative ${
              tab==='pool'? 'bg-neutral-100 border-neutral-300':'border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            Замовлення
            {hasNew && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />}
          </button>
          <button
            onClick={()=>setTab("mine")}
            className={`px-3 py-1.5 rounded-lg border ${tab==='mine'? 'bg-neutral-100 border-neutral-300':'border-neutral-200 hover:bg-neutral-50'}`}
          >
            Мої
          </button>
        </div>
      </div>

      {/* Пул */}
      {tab==='pool' && (
        <div className="bg-white rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Карта</th>
                <th className="py-2 px-3">Плити</th>
                <th className="py-2 px-3">Індексів</th>
                <th className="py-2 px-3">Дії</th>
              </tr>
            </thead>
            <tbody>
              {pool.length===0 && (
                <tr><td colSpan={5} className="py-8 text-center text-neutral-500">Поки що порожньо.</td></tr>
              )}
              {pool.map((o, i)=> (
                <React.Fragment key={o.id}>
                  <tr className="border-b hover:bg-neutral-50">
                    <td className="py-2 px-3 align-top">{i+1}</td>
                    <td className="py-2 px-3 font-medium align-top">
                      <div className="flex items-center gap-2">
                        <button onClick={()=>toggleOpen(o.id)} className="px-2 py-1 rounded-md border border-neutral-300 hover:bg-neutral-50 text-xs">
                          {open[o.id]? 'Сховати' : 'Показати'}
                        </button>
                        <span>{o.fileName}</span>
                      </div>
                      {open[o.id] && (
                        <div className="mt-2">
                          <table className="w-full text-xs bg-neutral-50 rounded-lg overflow-hidden">
                            <thead className="text-neutral-500">
                              <tr>
                                <th className="py-1 px-2 w-10 text-left">#</th>
                                <th className="py-1 px-2 text-left">Index</th>
                                <th className="py-1 px-2 text-left">Всього</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.items.map((it, idx) => (
                                <tr key={it.index + idx} className="border-t">
                                  <td className="py-1 px-2">{idx + 1}</td>
                                  <td className="py-1 px-2 font-mono">{it.index}</td>
                                  <td className="py-1 px-2 font-medium">
                                    {itemTotal(o.plates, it.qtyPerCard)}
                                  </td>
                                </tr>
                              ))}
                              {o.items.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="py-2 px-2 text-neutral-500">Порожньо</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 align-top">{o.plates}</td>
                    <td className="py-2 px-3 align-top">{o.items.length}</td>
                    <td className="py-2 px-3 align-top">
                      <button
  				onClick={() => takeOrder(o.id)}
  				className={`px-3 py-1.5 rounded-lg text-white ${btnColorByPriority(o.priority)}`}
					>
  					Забрати
		     </button>
		    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Мої */}
      {tab==='mine' && (
        <div className="bg-white rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Карта</th>
                <th className="py-2 px-3">Статус</th>
                <th className="py-2 px-3 w-48">Тип плити</th>
                <th className="py-2 px-3">Плити</th>
                <th className="py-2 px-3">Дії</th>
              </tr>
            </thead>
            <tbody>
              {mine.length===0 && (
                <tr><td colSpan={6} className="py-8 text-center text-neutral-500">Поки що порожньо.</td></tr>
              )}
              {mine.map((o, i)=> (
                <tr key={o.id} className="border-b hover:bg-neutral-50 align-top">
                  <td className="py-2 px-3">{i+1}</td>
                  <td className="py-2 px-3 font-medium">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>toggleOpen(o.id)} className="px-2 py-1 rounded-md border border-neutral-300 hover:bg-neutral-50 text-xs">
                        {open[o.id]? 'Сховати' : 'Показати'}
                      </button>
                      <span>{o.fileName}</span>
                    </div>
                    {open[o.id] && (
                      <div className="mt-2">
                        <table className="w-full text-xs bg-neutral-50 rounded-lg overflow-hidden">
                          <thead className="text-neutral-500">
                            <tr>
                              <th className="py-1 px-2 w-10 text-left">#</th>
                              <th className="py-1 px-2 text-left">Index</th>
                              <th className="py-1 px-2 text-left">Всього</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.items.map((it, idx) => (
                              <tr key={it.index + idx} className="border-t">
                                <td className="py-1 px-2">{idx + 1}</td>
                                <td className="py-1 px-2 font-mono">{it.index}</td>
                                <td className="py-1 px-2 font-medium">
                                  {itemTotal(o.plates, it.qtyPerCard)}
                                </td>
                              </tr>
                            ))}
                            {o.items.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-2 px-2 text-neutral-500">Порожньо</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                        <div className="mt-1 text-xs text-neutral-500">
                          Оператор: <b>{o.assignee || username}</b>{" "}
                          •{" "}
                          {o.closedAt
                            ? `Закрито: ${new Date(o.closedAt).toLocaleString()}`
                            : o.startedAt
                            ? `Старт: ${new Date(o.startedAt).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                    )}
                  </td>

                  <td className="py-2 px-3">
                    <Badge color={STATUS_COLOR_OP[o.status]}>{STATUS_LABEL_OP[o.status]}</Badge>
                  </td>

                  {/* Тип плити — вибір завжди доступний */}
                  <td className="py-2 px-3">
                    <div>
                      <select
                        value={o.boardFormatId || ""}
                        onChange={(e) => {
                          const val = e.target.value || undefined;
                          setDb(prev => prev.map(x => x.id===o.id ? { ...x, boardFormatId: val } : x));
                        }}
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1"
                        title="Тип плити"
                      >
                        <option value="">— не вибрано —</option>
                        {formatsForOrder(o).map(bf => (
                          <option key={bf.id} value={bf.id}>{bf.name}</option>
                        ))}
                      </select>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Матеріал: {materialHintByFirstIndex(o) || "невідомо"}
                      </div>
                    </div>
                  </td>

                  <td className="py-2 px-3">{o.plates}</td>

                  <td className="py-2 px-3 flex gap-2">
                    {(o.status==="taken" || o.status==="in_progress") && (
                      <button onClick={()=>startOrder(o.id)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Старт</button>
                    )}
                    {(o.status==="taken" || o.status==="in_progress") && (
                      <button onClick={()=>{ setClosing(o); setDozRows([{ index: "", qty: 0 }]); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Закрити</button>
                    )}
                    {o.status==="done" && (
                      <div className="flex items-center gap-2 text-neutral-600">
                        <span className="text-neutral-500">закрито</span>
                        <button onClick={()=>openPrint(o, username)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Друк наліпок</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка Закрити (ДОЗАМОВИТИ) */}
      {closing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg ring-1 ring-black/5">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium">Закрити карту — {closing.fileName}</div>
              <button onClick={()=>setClosing(null)} className="px-2 py-1 rounded-lg hover:bg-neutral-100">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-neutral-600">Якщо треба ДОЗАМОВИТИ — додайте індекси та к-ть. Якщо все ок — залиште порожнім.</div>

              <div className="space-y-2">
                {dozRows.map((row, i)=> (
                  <div key={i} className="flex gap-2">
                    <input value={row.index} onChange={e=>updRow(i,{ index: e.target.value })} placeholder="Index" className="flex-1 rounded-lg border border-neutral-300 px-2 py-1" />
                    <input value={row.qty} onChange={e=>updRow(i,{ qty: Number(e.target.value)||0 })} placeholder="К-ть" type="number" min={0} className="w-28 rounded-lg border border-neutral-300 px-2 py-1" />
                    <button onClick={()=>rmRow(i)} className="px-2 rounded-lg border border-neutral-300 hover:bg-neutral-50">–</button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={addRow} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Додати рядок</button>
                <div className="flex-1" />
                <button onClick={confirmClose} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Підтвердити</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================
   Dev-тести helper-ів
   ============================ */
export const __operator_tests__ = {
  sumByIndex: () => {
    const got = sumByIndex([{index:"A",qty:2},{index:"A",qty:3},{index:"B",qty:1}]);
    return got.A===5 && got.B===1;
  },
  toAXRows: () => {
    const order: OperatorOrder = { id: "1", fileName: "P01", plates: 8, items: [{index:"X",qtyPerCard:1},{index:"Y",qtyPerCard:2}], status: "taken", createdAt: new Date().toISOString() };
    const rows = toAXRows(order);
    const ok = rows.find(r=>r.index==="X")?.qty===8 && rows.find(r=>r.index==="Y")?.qty===16;
    return !!ok;
  },
  totalsVisible: () => itemTotal(10, 3) === 30 && itemTotal(1, 0) === 0,
  persistence: () => {
    const sample: OperatorOrder[] = [
      { id: 't1', fileName: 'P01', plates: 2, items:[{index:'I',qtyPerCard:3}], status:'pool', createdAt: new Date().toISOString() },
    ];
    try { localStorage.setItem(LS_DB, JSON.stringify(sample)); } catch {}
    const back = load<OperatorOrder[]>(LS_DB, []);
    const total = back[0] ? back[0].plates * back[0].items[0].qtyPerCard : 0;
    return Array.isArray(back) && back.length===1 && total===6;
  }
};
