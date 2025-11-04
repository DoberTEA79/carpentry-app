import React, { useEffect, useState } from "react";

/* ============================
   LS keys
   ============================ */
const LS_USERS  = "carpentry_users_v1";
const LS_AUTH   = "carpentry_auth";
const LS_BOARDS = "board_formats_db_v1"; // база форматів плит

/* ============================
   Типи
   ============================ */
type UserRow = {
  id: string;
  username: string;
  password: string;
  fullName: string;
  mainRole: string;        // тут зберігаємо укр. назву ("Конструктор")
  allowedPages: string[];  // а тут вже технічні ключі ("constructor")
  createdAt: string;
};

type BoardFormat = {
  id: string;
  name: string;
  material?: string;
  thickness?: number;
  size?: string;
};

/* ============================
   Довідники
   ============================ */
const ALL_PAGES = [
  { key: "operator",    label: "Оператор" },
  { key: "kitting",     label: "Комплектовка" },
  { key: "master",      label: "Майстер" },
  { key: "constructor", label: "Конструктор" },
  { key: "store",       label: "Комірник" },
  { key: "curator",     label: "Куратор / Адмін" },
];

// що показуємо у дропдауні “Сектор”
const MAIN_ROLES = [
  "Оператор",
  "Комплектовка",
  "Майстер",
  "Конструктор",
  "Комірник",
  "Адмін",
];

// МІГРАЦІЯ старих значень (якщо раніше зберігали "Конструктор" у allowedPages)
const PAGE_KEY_MIGRATION: Record<string, string> = {
  "Оператор": "operator",
  "Комплектовка": "kitting",
  "Майстер": "master",
  "Конструктор": "constructor",
  "Комірник": "store",
  "Куратор": "curator",
  "Куратор / Адмін": "curator",
};

/* ============================
   Helpers
   ============================ */
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
function genId() {
  return `U-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** мапа "що вибрано в полі Сектор" -> на який шлях вести */
function roleToPage(role: string): string {
  switch (role) {
    case "Оператор":
      return "/operator";
    case "Комплектовка":
      return "/kitting";
    case "Майстер":
      return "/master";
    case "Конструктор":
      return "/constructor";
    case "Комірник":
      return "/store";
    case "Адмін":
    case "Куратор / Адмін":
      return "/curator";
    default:
      return "/"; // запасний
  }
}

/* ============================
   Компонент
   ============================ */
export default function CuratorPage() {
  const [tab, setTab] = useState<"users" | "boards">("users");

  /* ---------- USERS ---------- */
  const [users, setUsers] = useState<UserRow[]>(() => {
    const stored = load<UserRow[]>(LS_USERS, []);

    // якщо порожньо — створюємо адміна
    if (!stored.length) {
      const admin: UserRow = {
        id: genId(),
        username: "admin",
        password: "admin",
        fullName: "Головний адміністратор",
        mainRole: "Адмін",
        allowedPages: ALL_PAGES.map((p) => p.key),
        createdAt: new Date().toISOString(),
      };
      save(LS_USERS, [admin]);
      return [admin];
    }

    // міграція allowedPages
    const migrated = stored.map((u) => ({
      ...u,
      allowedPages: (u.allowedPages || []).map(
        (p) => PAGE_KEY_MIGRATION[p] || p
      ),
    }));
    save(LS_USERS, migrated);
    return migrated;
  });

  // автосейв
  useEffect(() => save(LS_USERS, users), [users]);

  // вибраний
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    users.length ? users[0].id : null
  );
  useEffect(() => {
    if (selectedId && !users.find((u) => u.id === selectedId)) {
      setSelectedId(users.length ? users[0].id : null);
    }
  }, [users, selectedId]);

  const selected = users.find((u) => u.id === selectedId) || null;

  /* ---------- BOARDS (формати плит) ---------- */
  const [boards, setBoards] = useState<BoardFormat[]>(() =>
    load<BoardFormat[]>(LS_BOARDS, [])
  );
  useEffect(() => {
    save(LS_BOARDS, boards);
  }, [boards]);

  // слухач
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_BOARDS) {
        setBoards(load<BoardFormat[]>(LS_BOARDS, []));
      }
      if (e.key === LS_USERS) {
        const fresh = load<UserRow[]>(LS_USERS, []).map((u) => ({
          ...u,
          allowedPages: (u.allowedPages || []).map(
            (p) => PAGE_KEY_MIGRATION[p] || p
          ),
        }));
        setUsers(fresh);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* ---------- actions: users ---------- */
  function addUser() {
    const u: UserRow = {
      id: genId(),
      username: "user" + (users.length + 1),
      password: "",
      fullName: "Новий користувач",
      mainRole: "Оператор",
      allowedPages: ["operator"],
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [u, ...prev]);
    setSelectedId(u.id);
  }

  function updateUser(patch: Partial<UserRow>) {
    if (!selected) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === selected.id ? { ...u, ...patch } : u))
    );
  }

  function togglePage(pageKey: string) {
    if (!selected) return;
    const has = selected.allowedPages.includes(pageKey);
    const nextPages = has
      ? selected.allowedPages.filter((p) => p !== pageKey)
      : [...selected.allowedPages, pageKey];
    updateUser({ allowedPages: nextPages });
  }

  // ОНОВЛЕНО: після "увійти як" ще й переходимо на його сектор
  function quickLogin(u: UserRow) {
    const authObj = {
      username: u.username,
      fullName: u.fullName,
      role: u.mainRole,
      allowedPages: u.allowedPages,
      loggedAt: new Date().toISOString(),
    };
    save(LS_AUTH, authObj);

    const target = roleToPage(u.mainRole);
    window.location.href = target;
  }

  function deleteUser(id: string) {
    if (!confirm("Видалити користувача?")) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  /* ---------- actions: boards ---------- */
  function addBoard() {
    const bf: BoardFormat = {
      id: `BF-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      name: "Новий формат",
      material: "",
      thickness: undefined,
      size: "",
    };
    setBoards((prev) => [bf, ...prev]);
  }
  function updateBoard(id: string, patch: Partial<BoardFormat>) {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function deleteBoard(id: string) {
    if (!confirm("Видалити формат?")) return;
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }

  /* ============================
     RENDER
     ============================ */
  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Куратор / Адмін</h1>
        <div className="bg-neutral-100 rounded-xl p-1 text-sm">
          <button
            onClick={() => setTab("users")}
            className={`px-3 py-1.5 rounded-lg ${
              tab === "users" ? "bg-white shadow" : ""
            }`}
          >
            Користувачі
          </button>
          <button
            onClick={() => setTab("boards")}
            className={`px-3 py-1.5 rounded-lg ${
              tab === "boards" ? "bg-white shadow" : ""
            }`}
          >
            Формати плит
          </button>
        </div>
      </div>

      {/* USERS TAB */}
      {tab === "users" && (
        <div className="grid md:grid-cols-3 gap-4">
          {/* список-картки */}
          <div className="md:col-span-1 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm text-neutral-600">
                Користувачів: {users.length}
              </div>
              <button
                onClick={addUser}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                + Додати
              </button>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {users.map((u) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`rounded-xl border p-3 cursor-pointer ${
                    selectedId === u.id
                      ? "border-blue-400 bg-blue-50/50"
                      : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">
                      {u.fullName || u.username}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Логін: <b className="font-mono">{u.username}</b>
                  </div>
                  <div className="text-xs mt-1">
                    Сектор: <span className="font-medium">{u.mainRole}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.allowedPages.map((p) => {
                      const def = ALL_PAGES.find((x) => x.key === p);
                      return (
                        <span
                          key={p}
                          className="px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-[11px] border border-green-100"
                        >
                          {def ? def.label : p}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-sm text-neutral-500">
                  Поки немає користувачів.
                </div>
              )}
            </div>
          </div>

          {/* форма */}
          <div className="md:col-span-2">
            {!selected && (
              <div className="h-full flex items-center justify-center text-neutral-500">
                Оберіть користувача…
              </div>
            )}
            {selected && (
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-medium">
                    Налаштування: {selected.fullName || selected.username}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => quickLogin(selected)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 text-sm"
                    >
                      Увійти як
                    </button>
                    <button
                      onClick={() => deleteUser(selected.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm"
                    >
                      Видалити
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-neutral-600">
                      Повне імʼя
                    </label>
                    <input
                      value={selected.fullName}
                      onChange={(e) => updateUser({ fullName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">
                      Основний сектор
                    </label>
                    <select
                      value={selected.mainRole}
                      onChange={(e) => updateUser({ mainRole: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                    >
                      {MAIN_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Логін</label>
                    <input
                      value={selected.username}
                      onChange={(e) => updateUser({ username: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Пароль</label>
                    <input
                      value={selected.password}
                      onChange={(e) => updateUser({ password: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                      type="text"
                    />
                    <div className="text-[11px] text-neutral-400 mt-1">
                      (зберігається просто в LocalStorage)
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">
                      Зареєстрований
                    </label>
                    <div className="mt-1 text-sm text-neutral-500">
                      {new Date(selected.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">
                    Доступні сторінки
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PAGES.map((p) => {
                      const active = selected.allowedPages.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          onClick={() => togglePage(p.key)}
                          className={`px-3 py-1.5 rounded-lg text-sm border ${
                            active
                              ? "bg-green-50 border-green-300 text-green-900"
                              : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-neutral-400 mt-2">
                    Цей список бачить логін і сторінки — ним і треба керувати.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOARDS TAB */}
      {tab === "boards" && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Формати плит</h2>
            <button
              onClick={addBoard}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
            >
              + Додати формат
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr className="border-b">
                  <th className="py-2 px-2 w-10">#</th>
                  <th className="py-2 px-2">Назва</th>
                  <th className="py-2 px-2 w-32">Матеріал</th>
                  <th className="py-2 px-2 w-32">Товщина</th>
                  <th className="py-2 px-2 w-40">Розмір</th>
                  <th className="py-2 px-2 w-28">Дії</th>
                </tr>
              </thead>
              <tbody>
                {boards.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-neutral-500">
                      Поки порожньо.
                    </td>
                  </tr>
                )}
                {boards.map((b, i) => (
                  <tr key={b.id} className="border-b">
                    <td className="py-2 px-2">{i + 1}</td>
                    <td className="py-2 px-2">
                      <input
                        value={b.name}
                        onChange={(e) => updateBoard(b.id, { name: e.target.value })}
                        className="w-full rounded-lg border border-neutral-200 px-2 py-1"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={b.material || ""}
                        onChange={(e) => updateBoard(b.id, { material: e.target.value })}
                        className="w-full rounded-lg border border-neutral-200 px-2 py-1"
                        placeholder="Skl12"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={b.thickness ?? ""}
                        onChange={(e) =>
                          updateBoard(b.id, {
                            thickness: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full rounded-lg border border-neutral-200 px-2 py-1"
                        type="number"
                        step="0.1"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={b.size || ""}
                        onChange={(e) => updateBoard(b.id, { size: e.target.value })}
                        className="w-full rounded-lg border border-neutral-200 px-2 py-1"
                        placeholder="2800×2070"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => deleteBoard(b.id)}
                        className="px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs"
                      >
                        Видалити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-neutral-500">
            Ці формати бачить Оператор, Майстер і всі, кому ти дозволиш.
          </div>
        </div>
      )}
    </div>
  );
}
