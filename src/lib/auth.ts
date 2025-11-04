// Простий MVP зберігання сесії та дозволів у localStorage
export type Direction =
  | "constructor" | "operators" | "storekeeper" | "tnut" | "kitting" | "assembly" | "masters" | "curator";

export type Auth = { username: string; direction: Direction };

export type Permission = {
  path: string;              // маршрут: "/constructor", "/operator", "/ax", ...
  read: boolean;
  write: boolean;
};

export type PermMatrix = {
  // дозволи за напрямком (роль/департамент)
  byDirection: Partial<Record<Direction, Permission[]>>;
  // адресні винятки: для конкретних користувачів
  byUser: Record<string, Permission[]>;
};

export const LS_AUTH = "carpentry_auth";
export const LS_PERMS = "carpentry_perms";

// Значення за замовчуванням: Куратор/Майстри бачать усе
const DEFAULT_PERMS: PermMatrix = {
  byDirection: {
    curator:   [{ path: "/constructor", read:true, write:true }, { path:"/operator", read:true, write:true }, { path:"/kitting", read:true, write:true }, { path:"/ax", read:true, write:true }],
    masters:   [{ path: "/constructor", read:true, write:true }, { path:"/operator", read:true, write:true }, { path:"/kitting", read:true, write:true }, { path:"/ax", read:true, write:true }],
    // інші ролі — нічого за замовчуванням (куратор потім додасть)
  },
  byUser: {}
};

export function getAuth(): Auth | null {
  try { return JSON.parse(localStorage.getItem(LS_AUTH) || "null"); } catch { return null; }
}

export function getPerms(): PermMatrix {
  try {
    const raw = localStorage.getItem(LS_PERMS);
    return raw ? JSON.parse(raw) as PermMatrix : DEFAULT_PERMS;
  } catch { return DEFAULT_PERMS; }
}

export function setPerms(next: PermMatrix) {
  try { localStorage.setItem(LS_PERMS, JSON.stringify(next)); } catch {}
}

export function hasAccess(path: string, need: "read"|"write" = "read"): boolean {
  const auth = getAuth();
  const perms = getPerms();
  if (!auth) return false;

  // 1) адресні винятки для юзера
  const userPerms = perms.byUser[auth.username] || [];
  const userHit = userPerms.find(p => path.startsWith(p.path));
  if (userHit && userHit[need]) return true;

  // 2) за напрямком
  const dirPerms = perms.byDirection[auth.direction] || [];
  const dirHit = dirPerms.find(p => path.startsWith(p.path));
  return !!(dirHit && dirHit[need]);
}
