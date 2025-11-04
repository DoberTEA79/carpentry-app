import React, { useEffect, useState } from "react";

const LS_USERS = "carpentry_users_v1";
const LS_AUTH = "carpentry_auth";

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export default function Login() {
  // 1. підтягуємо користувачів
  const [users, setUsers] = useState(() => {
    const stored = load(LS_USERS, []);
    // якщо порожньо — сідаємо адміна
    if (!stored || stored.length === 0) {
      const admin = {
        id: "U-admin",
        username: "admin",
        password: "admin",
        fullName: "Адміністратор",
        mainRole: "Адмін",
        allowedPages: [
          "operator",
          "kitting",
          "master",
          "constructor",
          "store",
          "curator",
        ],
        createdAt: new Date().toISOString(),
      };
      save(LS_USERS, [admin]);
      return [admin];
    }
    return stored;
  });

  const [selectedUserId, setSelectedUserId] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  // коли вибрали з дропдауна — підставити логін
  useEffect(() => {
    if (!selectedUserId) return;
    const u = users.find((x) => x.id === selectedUserId);
    if (u) {
      setLogin(u.username);
    }
  }, [selectedUserId, users]);

  function handleSubmit(e) {
    e.preventDefault();
    const list = load(LS_USERS, []);
    const user = list.find((u) => u.username === login);
    if (!user) {
      alert("Такого логіна немає у базі Куратора.");
      return;
    }
    if (user.password && user.password !== password) {
      alert("Пароль невірний.");
      return;
    }

    // зберегти сесію
    const authObj = {
      username: user.username,
      fullName: user.fullName,
      role: user.mainRole,
      allowedPages: user.allowedPages || [],
      loggedAt: new Date().toISOString(),
    };
    save(LS_AUTH, authObj);

    // переходимо на головну сторінку по основному сектору
    const sectorMap = {
      "Оператор": "operator",
      "Комплектовка": "kitting",
      "Майстер": "master",
      "Конструктор": "constructor",
      "Комірник": "store",
      "Адмін": "curator",
    };
    const tp = sectorMap[user.mainRole] || "operator";
    window.location.href = `/${tp}`;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-lg font-medium mb-4">Вхід</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-neutral-600">Виберіть користувача</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            >
              <option value="">— виберіть зі списку —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.username}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 mt-1">
              * список береться з Куратора (carpentry_users_v1)
            </p>
          </div>

          <div>
            <label className="text-sm text-neutral-600">Логін</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="напр. constructor-01"
            />
          </div>

          <div>
            <label className="text-sm text-neutral-600">Пароль (якщо є)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 hover:bg-blue-700"
          >
            Увійти
          </button>
        </form>
      </div>
    </div>
  );
}
