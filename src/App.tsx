import React from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';

/** =========
 *  Простий ACL (localStorage)
 *  ========= */
const LS_AUTH  = 'carpentry_auth';
const LS_PERMS = 'carpentry_perms';

type Auth = { username: string; direction: string } | null;
type Perm  = { path: string; read: boolean; write: boolean };
type PermMatrix = {
  byDirection?: Partial<Record<string, Perm[]>>;
  byUser?: Record<string, Perm[]>;
};

function getAuth(): Auth {
  try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch { return null; }
}
function getPerms(): PermMatrix {
  try { return JSON.parse(localStorage.getItem(LS_PERMS) || 'null') || {}; } catch { return {}; }
}
function hasAccess(path: string, need: 'read'|'write' = 'read'): boolean {
  const auth = getAuth();
  if (!auth) return false;
  const perms = getPerms();

  // 1) адресні права користувача мають пріоритет
  const userPerms = perms.byUser?.[auth.username] || [];
  const u = userPerms.find(p => path.startsWith(p.path));
  if (u && u[need]) return true;

  // 2) права за напрямком
  const dirPerms = perms.byDirection?.[auth.direction] || [];
  const d = dirPerms.find(p => path.startsWith(p.path));
  return !!(d && d[need]);
}

/** =========
 *  App (layout + меню з GuardedLink)
 *  ========= */
export default function App(){
  const loc = useLocation();
  const auth = getAuth();

  // На сторінці логіну показуємо лише контент логіну (без шапки/футера)
  if (loc.pathname === '/') {
    return <Outlet />;
  }

  // Якщо немає сесії — на логін
  if (!auth) {
    return <Navigate to="/" replace />;
  }

  // Локальний GuardedLink: показуємо пункт меню лише якщо є доступ (read)
  function GuardedLink({ to, children }: { to: string; children: React.ReactNode }) {
    if (!hasAccess(to, 'read')) return null;
    return <Link className={linkCls(loc.pathname === to)} to={to}>{children}</Link>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="text-xl tracking-[0.25em] font-light select-none">СТОЛЯРНА ДІЛЬНИЦЯ</div>
          <nav className="text-sm flex gap-3">
            <GuardedLink to="/constructor">Конструктор</GuardedLink>
            <GuardedLink to="/operator">Оператор</GuardedLink>
            <GuardedLink to="/kitting">Комплектовка</GuardedLink>
            <GuardedLink to="/ax">Комірник (AX)</GuardedLink>
            <GuardedLink to="/curator">Куратор</GuardedLink>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-neutral-500 py-6">
        © 2025 – Hjort Knudsen (BVB)
      </footer>
    </div>
  );
}

function linkCls(active:boolean){
  return `px-2 py-1 rounded-lg ${active ? 'bg-neutral-100 font-medium' : 'hover:bg-neutral-100'}`;
}
