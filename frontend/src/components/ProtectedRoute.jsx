import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const ROLE_RANK = { viewer: 0, clinician: 1, admin: 2 };

export default function ProtectedRoute({ children, minRole = "viewer" }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="font-mono text-sm text-ink-muted">Loading session…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if ((ROLE_RANK[user.role] ?? -1) < (ROLE_RANK[minRole] ?? 99)) {
    return (
      <div className="p-10 font-body text-sm text-ink-muted">
        Your role ({user.role}) doesn't have access to this page. Requires: {minRole}+.
      </div>
    );
  }

  return children;
}
