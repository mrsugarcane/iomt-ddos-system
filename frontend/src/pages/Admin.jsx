import React, { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import { useAuth } from "../lib/AuthContext";

export default function Admin() {
  const { authFetch, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", role: "viewer", displayName: "" });
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await authFetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users);
  }, [authFetch]);

  const loadAudit = useCallback(async () => {
    const res = await authFetch("/api/admin/audit?limit=30");
    if (res.ok) setAudit((await res.json()).log);
  }, [authFetch]);

  useEffect(() => { loadUsers(); loadAudit(); }, [loadUsers, loadAudit]);

  async function createUser(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create user.");
      setForm({ email: "", password: "", role: "viewer", displayName: "" });
      loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id) {
    if (!confirm("Deactivate this user? They will be logged out immediately.")) return;
    await authFetch(`/api/admin/users/${id}`, { method: "DELETE" });
    loadUsers();
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">ADMIN</div>
        <h1 className="font-display text-3xl text-ink-primary mb-2">User management & audit</h1>
        <p className="font-body text-ink-muted">Signed in as {user?.email} ({user?.role})</p>
      </section>

      <Panel eyebrow="CREATE USER" title="Add a new account">
        <form onSubmit={createUser} className="grid sm:grid-cols-2 gap-3">
          <input
            required type="email" placeholder="email@hospital.org"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="bg-surface2 border border-hairline rounded px-3 py-2 text-sm text-ink-primary"
          />
          <input
            required type="password" placeholder="password (min 10 chars)"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="bg-surface2 border border-hairline rounded px-3 py-2 text-sm text-ink-primary"
          />
          <input
            placeholder="Display name (optional)"
            value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="bg-surface2 border border-hairline rounded px-3 py-2 text-sm text-ink-primary"
          />
          <select
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="bg-surface2 border border-hairline rounded px-3 py-2 text-sm text-ink-primary"
          >
            <option value="viewer">viewer</option>
            <option value="clinician">clinician</option>
            <option value="admin">admin</option>
          </select>
          <button
            disabled={creating}
            className="sm:col-span-2 bg-signal text-void font-body text-sm font-medium rounded py-2 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </form>
        {error && <p className="font-mono text-xs text-alert mt-3">{error}</p>}
      </Panel>

      <Panel eyebrow="ACCOUNTS" title={`${users.length} users`}>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-hairline/50 last:border-0">
              <div>
                <span className="font-body text-sm text-ink-primary">{u.email}</span>
                <span className="font-mono text-[10px] text-ink-muted ml-2 uppercase">{u.role}</span>
                {!u.active && <span className="font-mono text-[10px] text-alert ml-2">DEACTIVATED</span>}
              </div>
              {u.active && u.id !== user?.id && (
                <button
                  onClick={() => deactivate(u.id)}
                  className="font-mono text-[11px] text-alert border border-alert/30 rounded px-2 py-1 hover:bg-alert/10"
                >
                  Deactivate
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="AUDIT LOG" title="Last 30 actions">
        <div className="font-mono text-[11px] space-y-1.5 max-h-80 overflow-y-auto">
          {audit.map((a) => (
            <div key={a.id} className="flex justify-between text-ink-muted border-b border-hairline/30 py-1">
              <span>{a.action} {a.target ? `· ${a.target}` : ""}</span>
              <span>{a.email || "—"} · {new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
