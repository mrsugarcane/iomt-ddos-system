import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-void px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-display font-semibold text-2xl text-ink-primary">
            Sentinel<span className="text-signal">-IoMT</span>
          </div>
          <div className="font-mono text-[10px] text-ink-faint mt-1 tracking-wider">
            DDoS PREDICTION SYSTEM — SECURE ACCESS
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface/80 border border-hairline rounded-lg p-6 space-y-4"
        >
          <div>
            <label className="font-mono text-[11px] text-ink-muted uppercase block mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink-primary font-body focus:outline-none focus:border-signal/50"
              placeholder="you@hospital.org"
            />
          </div>
          <div>
            <label className="font-mono text-[11px] text-ink-muted uppercase block mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink-primary font-body focus:outline-none focus:border-signal/50"
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <div className="font-mono text-xs text-alert bg-alert/10 border border-alert/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-md bg-signal text-void font-body font-medium text-sm hover:bg-signal-glow transition-colors disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="font-mono text-[10px] text-ink-faint text-center mt-5">
          Default admin: admin@sentinel.local — change this password immediately after first login.
        </p>
      </div>
    </div>
  );
}
