import React, { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import SeverityBadge from "../components/SeverityBadge";
import { useAuth } from "../lib/AuthContext";

const STATUS_TABS = ["open", "acknowledged", "escalated", "resolved"];

export default function AlertQueue() {
  const { authFetch, user } = useAuth();
  const [status, setStatus] = useState("open");
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actingOn, setActingOn] = useState(null);
  const [note, setNote] = useState("");

  const canAct = user && (user.role === "clinician" || user.role === "admin");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/alerts?status=${status}&limit=50`);
      if (!res.ok) throw new Error("Failed to load alerts.");
      const data = await res.json();
      setAlerts(data.alerts);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch, status]);

  useEffect(() => { load(); }, [load]);

  async function act(alertId, action) {
    try {
      const res = await authFetch(`/api/alerts/${alertId}/action`, {
        method: "POST",
        body: JSON.stringify({ action, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed.");
      }
      setActingOn(null);
      setNote("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">ALERT QUEUE</div>
        <h1 className="font-display text-3xl text-ink-primary mb-3">Persistent alert workflow</h1>
        <p className="font-body text-ink-muted leading-relaxed max-w-2xl">
          Every alert raised by the live scoring engine is written to the database here, so it
          survives a page refresh or a server restart — unlike the ephemeral radar view on the Live
          Monitor page. {canAct ? "Acknowledge, escalate, or resolve alerts below." : "Your role can view alerts but not act on them — clinician or admin access is required."}
        </p>
      </section>

      <div className="flex gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-wide border transition-colors ${
              status === s
                ? "bg-signal/10 text-signal border-signal/40"
                : "text-ink-muted border-hairline hover:text-ink-primary"
            }`}
          >
            {s} {status === s && total ? `(${total})` : ""}
          </button>
        ))}
      </div>

      {error && (
        <div className="font-mono text-xs text-alert bg-alert/10 border border-alert/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="font-mono text-sm text-ink-muted">Loading…</div>
      ) : alerts.length === 0 ? (
        <Panel className="text-sm text-ink-muted">No alerts with status "{status}".</Panel>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Panel key={a.id}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge tier={a.severity_tier} />
                    <span className="font-body text-sm text-ink-primary">{a.device_id}</span>
                    <span className="font-body text-xs text-ink-muted">
                      ({a.device_type?.replace("_", " ")})
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-ink-faint">
                    {a.attack_type?.replace("_", " ")} · confidence {(a.confidence * 100).toFixed(1)}%
                    · {a.packet_rate?.toLocaleString()} pkt/s · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>

                {canAct && status !== "resolved" && (
                  <div className="flex gap-2">
                    {actingOn === a.id ? (
                      <>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional note…"
                          className="bg-surface2 border border-hairline rounded px-2 py-1 text-xs font-body text-ink-primary w-40"
                        />
                        {status === "open" && (
                          <ActionBtn onClick={() => act(a.id, "acknowledge")}>Acknowledge</ActionBtn>
                        )}
                        <ActionBtn onClick={() => act(a.id, "escalate")} tone="triage">Escalate</ActionBtn>
                        <ActionBtn onClick={() => act(a.id, "resolve")} tone="signal">Resolve</ActionBtn>
                        <button
                          onClick={() => { setActingOn(null); setNote(""); }}
                          className="font-mono text-[11px] text-ink-faint px-2"
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setActingOn(a.id)}
                        className="font-mono text-[11px] text-signal border border-signal/30 rounded px-3 py-1.5 hover:bg-signal/10"
                      >
                        Take action
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, tone = "signal" }) {
  const toneClass = {
    signal: "text-signal border-signal/40 hover:bg-signal/10",
    triage: "text-triage border-triage/40 hover:bg-triage/10",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[11px] border rounded px-3 py-1.5 ${toneClass}`}
    >
      {children}
    </button>
  );
}
