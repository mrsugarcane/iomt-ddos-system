import React, { useState } from "react";
import Panel from "../components/Panel";
import { useAuth } from "../lib/AuthContext";

export default function Account() {
  const { user, authFetch, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change password.");
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-md">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">ACCOUNT</div>
        <h1 className="font-display text-3xl text-ink-primary mb-2">Your account</h1>
        <p className="font-body text-ink-muted">
          {user?.email} · <span className="font-mono text-xs uppercase">{user?.role}</span>
        </p>
      </section>

      <Panel eyebrow="SECURITY" title="Change password">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Current password" value={currentPassword} onChange={setCurrentPassword} />
          <Field label="New password (min 10 characters)" value={newPassword} onChange={setNewPassword} />
          <Field label="Confirm new password" value={confirm} onChange={setConfirm} />

          {error && (
            <div className="font-mono text-xs text-alert bg-alert/10 border border-alert/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="font-mono text-xs text-signal bg-signal/10 border border-signal/30 rounded px-3 py-2">
              Password changed. Your other sessions have been logged out.
            </div>
          )}

          <button
            disabled={submitting}
            className="w-full py-2.5 rounded-md bg-signal text-void font-body font-medium text-sm hover:bg-signal-glow transition-colors disabled:opacity-50"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </Panel>

      <button
        onClick={logout}
        className="font-mono text-[11px] text-ink-muted hover:text-alert"
      >
        Log out of this session
      </button>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="font-mono text-[11px] text-ink-muted uppercase block mb-1.5">{label}</label>
      <input
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink-primary font-body focus:outline-none focus:border-signal/50"
      />
    </div>
  );
}
