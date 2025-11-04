import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuth, hasAccess } from "../lib/auth";

export default function Protected({ path, need = "read", children }:{
  path: string;
  need?: "read"|"write";
  children: React.ReactNode;
}){
  const auth = getAuth();
  const loc = useLocation();
  if (!auth) return <Navigate to="/" replace />;
  if (!hasAccess(path, need)) return <div className="text-sm text-red-600">Доступ заборонено</div>;
  return <>{children}</>;
}
