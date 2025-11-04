// src/pages/CuratorBoards.tsx
import React from "react";

export type BoardFormat = {
  id: string;
  name: string;
  material?: string;
  thickness?: number;
  size?: string;
  active?: boolean;
};

const LS_BOARDS = "board_formats_db_v1";

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, val: T){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function genId(prefix="BF"){ return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }

export default function CuratorBoardsPage(){
  const [boards, setBoards] = React.useState<BoardFormat[]>(() => load<BoardFormat[]>(LS_BOARDS, []));
  React.useEffect(()=>save(LS_BOARDS, boards), [boards]);

  React.useEffect(() => {
    function onStorage(e: StorageEvent){
      if (e.key === LS_BOARDS) setBoards(load<BoardFormat[]>(LS_BOARDS, []));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    if (boards.length) return;
    setBoards([
      { id: genId(), name: "ДСП 15 — 2800×2070", material: "ДСП", thickness: 15, size: "2800×2070", active: true },
      { id: genId(), name: "Фанера 12 — 1525×1525", material: "Фанера", thickness: 12, size: "1525×1525", active: true },
      { id: genId(), name: "Фанера 12 — 2800×1280", material: "Фанера", thickness: 12, size: "2800×1280", active: true },
      { id: genId(), name: "Фанера 12 — 1525×1470", material: "Фанера", thickness: 12, size: "1525×1470", active: true },
    ]);
  }, [boards.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Куратор — Формати плит</h1>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <BoardForm onAdd={(row) => setBoards(prev => [{ id: genId(), active: true, ...row }, ...prev])} />
        <div className="flex-1" />
        <ImportExportBoards boards={boards} onImport={(list)=>setBoards(list)} />
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b">
              <th className="py-2 px-2 w-10">#</th>
              <th className="py-2 px-2">Назва</th>
              <th className="py-2 px-2 w-28">Матеріал</th>
              <th className="py-2 px-2 w-24">Товщина</th>
              <th className="py-2 px-2 w-36">Розмір</th>
              <th className="py-2 px-2 w-24">Статус</th>
              <th className="py-2 px-2 w-56">Дії</th>
            </tr>
          </thead>
          <tbody>
            {boards.length===0 && (
              <tr><td colSpan={7} className="py-8 text-center text-neutral-500">Порожньо</td></tr>
            )}
            {boards.map((b, i) => (
              <tr key={b.id} className="border-b">
                <td className="py-2 px-2">{i+1}</td>
                <td className="py-2 px-2">{b.name}</td>
                <td className="py-2 px-2">{b.material || "—"}</td>
                <td className="py-2 px-2">{b.thickness ?? "—"}</td>
                <td className="py-2 px-2">{b.size || "—"}</td>
                <td className="py-2 px-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${b.active ? "bg-emerald-50 text-emerald-700 border-emerald-200":"bg-neutral-50 text-neutral-600 border-neutral-200"}`}>
                    {b.active ? "активний" : "прихований"}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <div className="flex flex-wrap gap-2">
                    <EditBoardButton
                      board={b}
                      onSave={(patch)=>setBoards(prev=>prev.map(x=>x.id===b.id?{...x,...patch}:x))}
                    />
                    <button
                      onClick={()=>setBoards(prev=>prev.map(x=>x.id===b.id?{...x,active:!x.active}:x))}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50"
                    >
                      {b.active ? "Приховати" : "Активувати"}
                    </button>
                    <button
                      onClick={()=>setBoards(prev=>prev.filter(x=>x.id!==b.id))}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    >
                      Видалити
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-500">
        Оператор бачить тільки <b>активні</b> формати; Майстер використовує їх у звітах.
      </div>
    </div>
  );
}

/** Формочки/утиліти нижче такі ж, як давали раніше */
function BoardForm({ onAdd }:{ onAdd:(row: Omit<BoardFormat,"id"|"active">)=>void }){
  const [name, setName]         = React.useState("");
  const [material, setMaterial] = React.useState("");
  const [thk, setThk]           = React.useState<number| "">("");
  const [size, setSize]         = React.useState("");

  function submit(e: React.FormEvent){
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      material: material.trim() || undefined,
      thickness: thk===""? undefined : Number(thk),
      size: size.trim() || undefined,
    });
    setName(""); setMaterial(""); setThk(""); setSize("");
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
      <div>
        <label className="block text-xs text-neutral-600">Назва</label>
        <input value={name} onChange={e=>setName(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 w-64" placeholder="ДСП 15 — 2800×2070" />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Матеріал</label>
        <input value={material} onChange={e=>setMaterial(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 w-36" placeholder="ДСП / Фанера" />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Товщина</label>
        <input value={thk} onChange={e=>setThk(e.target.value===""? "" : Number(e.target.value)||"")} type="number" min={0} className="rounded-lg border border-neutral-300 px-2 py-1 w-24" placeholder="мм" />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Розмір</label>
        <input value={size} onChange={e=>setSize(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 w-40" placeholder="2800×2070" />
      </div>
      <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Додати</button>
    </form>
  );
}

function EditBoardButton({ board, onSave }:{ board:BoardFormat; onSave:(patch: Partial<BoardFormat>)=>void; }){
  const [open, setOpen] = React.useState(false);
  const [name, setName]         = React.useState(board.name || "");
  const [material, setMaterial] = React.useState(board.material || "");
  const [thk, setThk]           = React.useState<number| "">(board.thickness ?? "");
  const [size, setSize]         = React.useState(board.size || "");

  function submit(e: React.FormEvent){
    e.preventDefault();
    onSave({
      name: name.trim() || board.name,
      material: material.trim() || undefined,
      thickness: thk===""? undefined : Number(thk),
      size: size.trim() || undefined,
    });
    setOpen(false);
  }

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Редагувати</button>
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg ring-1 ring-black/5">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium">Редагувати формат</div>
              <button onClick={()=>setOpen(false)} className="px-2 py-1 rounded-lg hover:bg-neutral-100">✕</button>
            </div>
            <form onSubmit={submit} className="p-4 space-y-3">
              <label className="block text-sm">Назва
                <input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1"/>
              </label>
              <label className="block text-sm">Матеріал
                <input value={material} onChange={e=>setMaterial(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1"/>
              </label>
              <label className="block text-sm">Товщина (мм)
                <input value={thk} onChange={e=>setThk(e.target.value===""? "" : Number(e.target.value)||"")} type="number" min={0} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1"/>
              </label>
              <label className="block text-sm">Розмір
                <input value={size} onChange={e=>setSize(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1"/>
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={()=>setOpen(false)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Скасувати</button>
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Зберегти</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ImportExportBoards({ boards, onImport }:{ boards:BoardFormat[]; onImport:(rows:BoardFormat[])=>void; }){
  function doExport(){
    const blob = new Blob([JSON.stringify(boards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "board_formats.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function doImport(ev: React.ChangeEvent<HTMLInputElement>){
    const f = ev.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BoardFormat[];
        if (!Array.isArray(parsed)) throw new Error("Invalid JSON");
        const cleaned = parsed.map((r) => ({
          id: r.id || genId(),
          name: String(r.name||"").trim() || "Формат без назви",
          material: r.material?.trim() || undefined,
          thickness: typeof r.thickness === "number" ? r.thickness : undefined,
          size: r.size?.trim() || undefined,
          active: r.active !== false,
        }));
        onImport(cleaned);
      } catch {
        alert("Помилка імпорту. Перевірте файл.");
      }
    };
    reader.readAsText(f);
    ev.target.value = "";
  }
  return (
    <div className="flex gap-2">
      <button onClick={doExport} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">Експорт JSON</button>
      <label className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 cursor-pointer">
        Імпорт JSON
        <input type="file" accept="application/json" onChange={doImport} className="hidden"/>
      </label>
    </div>
  );
}
