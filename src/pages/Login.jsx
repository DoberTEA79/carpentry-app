import React, { useEffect, useState } from "react";

const LS_AUTH = "carpentry_auth";
const LS_USERS = "carpentry_users_v1";

export default function LoginPage() {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  // підтягуємо юзерів з Куратора
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_USERS);
      const list = raw ? JSON.parse(raw) : [];
      setUsers(list);
    } catch (e) {
      setUsers([]);
    }
  }, []);

  function handleSelectUser(id) {
    setSelectedUserId(id);
    const u = users.find((x) => x.id === id);
    if (u) {
      setUsername(u.username);
      // пароль не чіпаємо
    }
  }

  function handleLogin(e) {
    e.preventDefault();

    const user = users.find((u) => u.username === username);
    if (!user) {
      alert("Такого логіна немає у базі Куратора.");
      return;
    }

    if (user.password && user.password !== password) {
      alert("Пароль невірний.");
      return;
    }

    const authObj = {
      username: user.username,
      fullName: user.fullName,
      role: user.mainRole,
      allowedPages: user.allowedPages || [],
      loggedAt: new Date().toISOString(),
    };
    localStorage.setItem(LS_AUTH, JSON.stringify(authObj));

    // куди перекинути
    const map = {
      "Оператор": "/operator",
      "Комплектовка": "/kitting",
      "Майстер": "/masters",
      "Конструктор": "/constructor",
      "Комірник": "/store",
      "Адмін": "/curator",
    };
    const target = map[user.mainRole] || "/";
    window.location.href = target;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="bg-white rounded-2xl shadow-md border border-neutral-200 w-full max-w-md p-6">
        <h1 className="text-lg font-semibold mb-4">Вхід</h1>

        <label className="block text-sm text-neutral-600 mb-1">
          Виберіть користувача
        </label>
        <select
          value={selectedUserId}
          onChange={(e) => handleSelectUser(e.target.value)}
          className="w-full mb-4 rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">— виберіть зі списку —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName || u.username}
            </option>
          ))}
        </select>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Логін</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="напр. constructor-01"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600 mb-1">
              Пароль (якщо є)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
          >
            Увійти
          </button>
        </form>

        <p className="mt-3 text-[11px] text-neutral-400">
          * список береться з Куратора (carpentry_users_v1)
        </p>
      </div>
    </div>
  );
}
