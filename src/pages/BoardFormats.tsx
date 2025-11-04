import React, { useEffect, useMemo, useState } from "react";

type BoardFormat = {
  id: string;           // UUID
  name: string;         // видимий підпис, напр. "ДСП15 — 2800×2070"
  material?: string;    // ключ матеріалу (напр. "Skl15" або "W18") — можна лишити порожнім
  thickness?: number;   // не обов'язково
  size?: string;        // "2800x2070" (інфо)
};

const LS_BOARDS = "board_formats_db_v1";

function load<T>(k:string, fb:T):T{ try{const r=localStorage.getItem(k); return r? JSON.parse(r) as T : fb;}catch{return fb}}
function save<T>(k:string, v:T){ try{localStorage.setItem(k, JSON.stringify(v));}catch{} }
function uid(){ return `bf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}` }

export default function BoardFormatsPage(){
  const [rows, setRows] = useState<BoardFormat[]>(()=>load(LS_BOARDS, [
    { id: uid(), name:"ДСП15 — 2800×2070", material:"Skl15", thickness:15, size:"2800x2070" },
    { id: uid(), name:"Фанера 12 — 1525×1525", material:"W12", thickness:12, size:"1525x1525" },
    { id: uid(), name:"Фанера 12 — 2800×1280", material:"W12", thickness:12, size:"2800x1280" },
  ]));

  useEffect(()=>save(LS_BOARDS, rows), [rows]);

  const [form, setForm] = useState<Partial<BoardFormat>>({});
  const [editing, setEditing] = useState<string|null>(null);

  function reset(){ setForm({}); setEditing(null); }
  function startEdit(r:BoardFormat){ setForm(r); setEditing(r.id); }
  function remove(id:string){ if(!confirm("Видалити формат?")) return; setRows(rs=>rs.filter(r=>r.id!==id)); }

  function submit(e:React.FormEvent){
    e.preventDefault();
    const name = (form.name||"").trim();
    if(!name) return;
    const payload: BoardFormat = {
      id: editing || uid(),
      name,
      material: (form.material||"").trim() || undefined,
      thickness: form.thickness ? Number(form.thickness) : undefined,
      size: (form.size||"").trim() || undefined,
    };
    setRows(rs=>{
      if(editing) return rs.map(r=>r.id===editing? payload : r);
      return [payload, ...rs];
    });
    reset();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Куратор — Формати плит</h1>

      <form onSubmit={submit} className="bg-white border rounded-xl p-4 space-y-2">
        <div className="grid sm:grid-cols-4 gap-2">
          <input className="rounded-lg border px-2 py-1" placeholder="Назва (видима)" value={form.name||""} onChange={e=>setForm({...form, name:e.target.value})}/>
          <input className="rounded-lg border px-2 py-1" placeholder="Матеріал (опц.) напр. Skl15" value={form.material||""} onChange={e=>setForm({...form, material:e.target.value})}/>
          <input className="rounded-lg border px-2 py-1" placeholder="Товщина (опц.)" value={form.thickness||""} onChange={e=>setForm({...form, thickness:Number(e.target.value)||undefined})}/>
          <input className="rounded-lg border px-2 py-1" placeholder="Розмір (опц.) 2800x2070" value={form.size||""} onChange={e=>setForm({...form, size:e.target.value})}/>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white">{editing? "Зберегти" : "Додати"}</button>
          {editing && <button type="button" onClick={reset} className="px-3 py-1.5 rounded-lg border">Скасувати</button>}
        </div>
      </form>

      <div className="bg-white border rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b">
              <th className="py-2 px-3 w-12">#</th>
              <th className="py-2 px-3">Назва</th>
              <th className="py-2 px-3 w-28">Матеріал</th>
              <th className="py-2 px-3 w-28">Товщина</th>
              <th className="py-2 px-3 w-32">Розмір</th>
              <th className="py-2 px-3 w-36">Дії</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Порожньо</td></tr>}
            {rows.map((r,i)=>(
              <tr key={r.id} className="border-b">
                <td className="py-2 px-3">{i+1}</td>
                <td className="py-2 px-3">{r.name}</td>
                <td className="py-2 px-3">{r.material||"—"}</td>
                <td className="py-2 px-3">{r.thickness ?? "—"}</td>
                <td className="py-2 px-3">{r.size || "—"}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded border" onClick={()=>startEdit(r)}>Редагувати</button>
                    <button className="px-2 py-1 rounded border" onClick={()=>remove(r.id)}>Видалити</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
