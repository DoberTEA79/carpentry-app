import React, { useEffect, useMemo, useState } from "react";

/** ============================
 *  Типи і ключі LocalStorage
 *  ============================ */
type KStatus = "pool" | "taken" | "in_progress" | "done";

	const STATUS_LABEL: Record<KStatus,string> = 
	{
  		pool:        "В пулі",
  		taken:       "Взято",
  		in_progress: "В роботі",
  		done:        "Готово",
	};

	const STATUS_COLOR: Record<KStatus,"gray"|"blue"|"amber"|"green"> = 
	{
  		pool: "gray",
 		taken: "blue",
  		in_progress: "amber",
  		done: "green",
	};

type DozRow = { index: string; qty: number };

// Замовлення Комплектовки (модель S_D item)
type KittingOrder = {
  id: string;
  sdItem: string;        // модель
  qtyPlan: number;       // планова к-ть
  location: string;      // W/P/S/A/B...
  status: KStatus;
  assignee?: string;     // username
  priority?: number;
  createdAt: string;
  takenAt?: string;
  startedAt?: string;
  closedAt?: string;
  transferHistory?: { to: string; at: string; by: string }[];
};

const LS_AUTH          = "carpentry_auth";   // сесія
const LS_KITTING_DB    = "kitting_db_v1";    // ЄДИНА база Комплектовки (pool/мої/готові)
const LS_KITTING_POOL0 = "kitting_pool";     // легасі-пул (якщо Куратор/Майстер скидав туди)
const LS_KITTING_BUMP  = "kitting_pool_bump";

// ВАЖЛИВО: дозамовлення від Комплектовки тепер пишемо сюди (лише для Конструктора)
const LS_DOZ_KIT       = "DOZ_kitting";

/** ============================
 *  Хелпери LocalStorage
 *  ============================ */
function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save<T>(key: string, val: T){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function sumByIndex(rows: DozRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.index || "").trim();
    if (!k) continue;
    acc[k] = (acc[k] ?? 0) + (Number(r.qty) || 0);
  }
  return acc;
}

/** ============================
 *  Статичні дані / довідники
 *  ============================ */
const LOCS = [
  { code: "W", label: "Височка" },
  { code: "P", label: "Потуліца" },
  { code: "S", label: "Дивани" },
  { code: "A", label: "Боки" },
  { code: "B", label: "Броди" },
];

const TEAM_KITTING = [
  "kitt-01", "kitt-02", "kitt-03", "kitt-04"
];

/** ============================
 *  UI дрібниці
 *  ============================ */
function Badge({children, color}:{children: React.ReactNode; color: "blue"|"amber"|"green"|"gray"}){
  const cls = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-neutral-50 text-neutral-700 border-neutral-200",
  }[color];
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${cls}`}>{children}</span>;
}

/** ============================
 *  Сторінка Комплектовка
 *  ============================ */
export default function KittingPage(){
  // Хто зайшов
  const auth = useMemo(()=>{
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || "null"); } catch { return null; }
  }, []);
  const username: string = auth?.username || "kitting";

  // БД Комплектовки
  const [db, setDb] = useState<KittingOrder[]>(() => load<KittingOrder[]>(LS_KITTING_DB, []));

  // Автозбереження
  useEffect(()=> save(LS_KITTING_DB, db), [db]);

  // Міграція зі старого пулу (якщо Майстер накидав)
  useEffect(() => {
  function mergeOnce() {
    const legacy = load<KittingOrder[]>(LS_KITTING_POOL0, []);
    if (!legacy.length) return;
    setDb(prev => {
      const seen = new Set(prev.map(o => o.id));
      const added = legacy.filter(o => !seen.has(o.id));
      return added.length ? [...added, ...prev] : prev;
    });
  }

  mergeOnce();

  function onStorage(e: StorageEvent) {
    if (e.key === LS_KITTING_POOL0 || e.key === LS_KITTING_BUMP) mergeOnce();
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

  // Фільтри/сортування
  const [locFilter, setLocFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<"sd"|"status"|"time">("sd");

  const filteredPool = useMemo(() => {
    let list = pool;
    if (locFilter) list = list.filter(o => o.location === locFilter);
    switch (sortKey) {
      case "sd":     list = [...list].sort((a,b)=> a.sdItem.localeCompare(b.sdItem)); break;
      case "status": list = [...list].sort((a,b)=> a.status.localeCompare(b.status)); break;
      case "time":   list = [...list].sort((a,b)=> (a.createdAt || "").localeCompare(b.createdAt || "")); break;
    }
    return list;
  }, [pool, locFilter, sortKey]);

  // Disclosure
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggleOpen = (id:string)=> setOpen(prev=> ({...prev, [id]: !prev[id]}));

  // Модалки: Закрити / Передати
  const [closing, setClosing] = useState<KittingOrder|null>(null);
  const [dozRows, setDozRows] = useState<DozRow[]>([{ index: "", qty: 0 }]);
  const addDoz = ()=> setDozRows(r=>[...r, { index:"", qty:0 }]);
  const rmDoz  = (i:number)=> setDozRows(r=> r.filter((_,idx)=>idx!==i));
  const updDoz = (i:number, patch:Partial<DozRow>)=> setDozRows(r=> r.map((row,idx)=> idx===i? { ...row, ...patch } : row));

  const [xfer, setXfer] = useState<KittingOrder|null>(null);
  const [xferTo, setXferTo] = useState<string>("");

  // Дії
  function takeOrder(id: string){
    setDb(prev => prev.map(o => o.id===id && o.status==='pool'
      ? { ...o, status:"taken", assignee: username, takenAt: new Date().toISOString() }
      : o));
  }

  function startOrder(id: string){
    setDb(prev => prev.map(o => o.id===id && o.assignee===username && (o.status==="taken" || o.status==="in_progress")
      ? { ...o, status:"in_progress", startedAt: o.startedAt || new Date().toISOString() }
      : o));
  }

  // ГОЛОВНА ЗМІНА: при закритті пишемо лише у DOZ_kitting і не чіпаємо AX
  function confirmClose(){
    if (!closing) return;

    // 1) Зібрати дозамовлення
    const clean = dozRows
      .map(r => ({ index: (r.index || "").trim(), qty: Number(r.qty) || 0 }))
      .filter(r => r.index && r.qty > 0);

    const dozSum = sumByIndex(clean);

    // 2) Оновити DOZ_kitting (+) — це бачить Конструктор у своєму розділі «ДОзамовлення»
    if (Object.keys(dozSum).length){
      const buf = load<Record<string, number>>(LS_DOZ_KIT, {});
      for (const [idx, q] of Object.entries(dozSum)) {
        buf[idx] = (buf[idx] ?? 0) + q;
      }
      save(LS_DOZ_KIT, buf);
    }

    // 3) Оновити статус замовлення Комплектовки
    setDb(prev => prev.map(o => o.id===closing.id && o.assignee===username
      ? { ...o, status:"done", closedAt: new Date().toISOString() }
      : o));

    // 4) Скинути модалку
    setClosing(null);
    setDozRows([{ index:"", qty:0 }]);
  }

  function doTransfer(){
    if (!xfer || !xferTo) return;
    setDb(prev => prev.map(o => o.id===xfer.id && o.assignee===username
      ? {
          ...o,
          assignee: xferTo,
          status: o.status==="done" ? "done" : (o.startedAt ? "in_progress" : "taken"),
          transferHistory: [...(o.transferHistory||[]), { to: xferTo, at: new Date().toISOString(), by: username }],
        }
      : o));
    setXfer(null);
    setXferTo("");
  }

  // Вкладки
  const [tab, setTab] = useState<"pool"|"mine">("pool");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Комплектовка — Замовлення</div>
        <div className="flex items-center gap-3">
          <select value={locFilter} onChange={e=>setLocFilter(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm">
            <option value="">Всі локації</option>
            {LOCS.map(l=> <option key={l.code} value={l.code}>{l.code} — {l.label}</option>)}
          </select>
          <div className="bg-neutral-100 rounded-xl p-1 text-sm">
            <button onClick={()=>setSortKey("sd")}     className={`px-2 py-1 rounded-lg ${sortKey==='sd'?'bg-white shadow':''}`}>S_D item</button>
            <button onClick={()=>setSortKey("status")} className={`px-2 py-1 rounded-lg ${sortKey==='status'?'bg-white shadow':''}`}>Статус</button>
            <button onClick={()=>setSortKey("time")}   className={`px-2 py-1 rounded-lg ${sortKey==='time'?'bg-white shadow':''}`}>Час</button>
          </div>

          <div className="flex gap-2 ml-2">
            <button onClick={()=>setTab("pool")} className={`px-3 py-1.5 rounded-lg border ${tab==='pool'? 'bg-neutral-100 border-neutral-300':'border-neutral-200 hover:bg-neutral-50'}`}>Замовлення</button>
            <button onClick={()=>setTab("mine")} className={`px-3 py-1.5 rounded-lg border ${tab==='mine'? 'bg-neutral-100 border-neutral-300':'border-neutral-200 hover:bg-neutral-50'}`}>Мої</button>
          </div>
        </div>
      </div>

      {/* Pool */}
      {tab==='pool' && (
        <div className="bg-white rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b">
                <th className="py-2 px-3 w-14">#</th>
                <th className="py-2 px-3">S_D item</th>
                <th className="py-2 px-3 w-28">К-ть план</th>
                <th className="py-2 px-3 w-28">Локація</th>
                <th className="py-2 px-3 w-40">Статус</th>
                <th className="py-2 px-3 w-40">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filteredPool.length===0 && (
                <tr><td colSpan={6} className="py-8 text-center text-neutral-500">Поки що порожньо.</td></tr>
              )}
              {filteredPool.map((o, i)=> (
                <tr key={o.id} className="border-b hover:bg-neutral-50">
                  <td className="py-2 px-3">{i+1}</td>
                  <td className="py-2 px-3 font-mono">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>toggleOpen(o.id)} className="px-2 py-1 rounded-md border border-neutral-300 hover:bg-neutral-50 text-xs">
                        {open[o.id]? 'Сховати' : 'Показати'}
                      </button>
                      <span>{o.sdItem}</span>
                    </div>
                    {open[o.id] && (
                      <div className="text-xs text-neutral-600 mt-1">
                        Створено: {new Date(o.createdAt).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">{o.qtyPlan}</td>
                  <td className="py-2 px-3">{o.location}</td>
                  <td className="py-2 px-3">
                    <Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </td>
                  <td className="py-2 px-3">
                    <button onClick={()=>takeOrder(o.id)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Забрати</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mine */}
      {tab==='mine' && (
        <div className="bg-white rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b">
                <th className="py-2 px-3 w-14">#</th>
                <th className="py-2 px-3">S_D item</th>
                <th className="py-2 px-3 w-28">Статус</th>
                <th className="py-2 px-3 w-28">К-ть план</th>
                <th className="py-2 px-3 w-28">Локація</th>
                <th className="py-2 px-3 w-[320px]">Дії</th>
              </tr>
            </thead>
            <tbody>
              {mine.length===0 && (
                <tr><td colSpan={6} className="py-8 text-center text-neutral-500">Поки що порожньо.</td></tr>
              )}
              {mine.map((o, i)=> (
                <tr key={o.id} className="border-b hover:bg-neutral-50 align-top">
                  <td className="py-2 px-3">{i+1}</td>
                  <td className="py-2 px-3">
                    <div className="font-mono">{o.sdItem}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {o.startedAt ? `Старт: ${new Date(o.startedAt).toLocaleString()}` : (o.takenAt ? `Взято: ${new Date(o.takenAt).toLocaleString()}` : "")}
                      {o.closedAt ? ` • Закрито: ${new Date(o.closedAt).toLocaleString()}` : ""}
                    </div>
                    {!!o.transferHistory?.length && (
                      <div className="text-xs text-neutral-500">
                        Передавалось: {o.transferHistory.length} раз(и)
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </td>
                  <td className="py-2 px-3">{o.qtyPlan}</td>
                  <td className="py-2 px-3">{o.location}</td>
                  <td className="py-2 px-3">
                    {(o.status==="taken" || o.status==="in_progress") && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={()=>startOrder(o.id)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Старт</button>
                        <button onClick={()=>{ setClosing(o); setDozRows([{ index:"", qty:0 }]); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Закрити</button>
                        <button onClick={()=>{ setXfer(o); setXferTo(""); }} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Передати</button>
                      </div>
                    )}
                    {o.status==="done" && (
                      <div className="text-neutral-500">закрито</div>
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
              <div className="font-medium">Закрити — {closing.sdItem}</div>
              <button onClick={()=>setClosing(null)} className="px-2 py-1 rounded-lg hover:bg-neutral-100">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-neutral-600">
                Вкажіть ДОЗАМОВИТИ (index + к-ть), за потреби. Якщо все ок — залиште порожнім. <br/>
                * За правилом Комплектовки — при «Закрила» к-ть виконаного = плану.
              </div>

              <div className="space-y-2">
                {dozRows.map((row, i)=> (
                  <div key={i} className="flex gap-2">
                    <input value={row.index} onChange={e=>updDoz(i,{ index: e.target.value })} placeholder="Index" className="flex-1 rounded-lg border border-neutral-300 px-2 py-1" />
                    <input value={row.qty} onChange={e=>updDoz(i,{ qty: Number(e.target.value)||0 })} placeholder="К-ть" type="number" min={0} className="w-28 rounded-lg border border-neutral-300 px-2 py-1" />
                    <button onClick={()=>rmDoz(i)} className="px-2 rounded-lg border border-neutral-300 hover:bg-neutral-50">–</button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={addDoz} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Додати рядок</button>
                <div className="flex-1" />
                <button onClick={confirmClose} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Підтвердити закриття</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка Передати */}
      {xfer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg ring-1 ring-black/5">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium">Передати — {xfer.sdItem}</div>
              <button onClick={()=>setXfer(null)} className="px-2 py-1 rounded-lg hover:bg-neutral-100">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <label className="block text-sm text-neutral-700">Кому передати</label>
              <select value={xferTo} onChange={e=>setXferTo(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-2 py-1">
                <option value="">Оберіть працівника…</option>
                {TEAM_KITTING.map(u => <option key={u} value={u}>{u}</option>)}
              </select>

              <div className="flex gap-2">
                <div className="flex-1" />
                <button onClick={doTransfer} disabled={!xferTo} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Передати</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ============================
 *  Dev-тести (локальні)
 *  ============================ */
export const __kitting_tests__ = {
  sum: () => {
    const got = (function(){
      const rows: DozRow[] = [{index:"A",qty:1},{index:"A",qty:2},{index:"B",qty:3}];
      const m = sumByIndex(rows);
      return m.A===3 && m.B===3;
    })();
    return got;
  },
};
