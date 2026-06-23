import React, { useMemo } from "react";
import Panel from "../components/Panel";
import SeverityBadge from "../components/SeverityBadge";
import { useLiveFeed } from "../lib/LiveFeedContext";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export default function LiveMonitor() {
  const { events, connected } = useLiveFeed();

  const fleetStatus = useMemo(() => {
    const byDevice = {};
    for (const e of events) byDevice[e.deviceId] = e;
    return Object.values(byDevice);
  }, [events]);

  const alerts = useMemo(
    () => [...events].reverse().filter((e) => e.predictedAttack),
    [events]
  );
  const totalFlows = events.length;
  const totalAlerts = alerts.length;

  return (
    <div className="space-y-10">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">LIVE MONITOR</div>
        <h1 className="font-display text-3xl text-ink-primary mb-3">Real-time fleet view</h1>
        <p className="font-body text-ink-muted leading-relaxed max-w-2xl">
          A simulated gateway scoring synthetic device traffic with the lightweight model selected
          for edge deployment — sped up for demonstration; alerts here are intermittent by design,
          not a constant flood.
        </p>
        {!connected && (
          <div className="mt-3 font-mono text-xs text-triage">
            Not connected to the backend. Start it with `npm start` inside /backend.
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <Panel>
          <div className="font-display text-2xl text-ink-primary">{totalFlows}</div>
          <div className="font-mono text-[11px] text-ink-muted uppercase mt-1">Flows observed (session)</div>
        </Panel>
        <Panel>
          <div className="font-display text-2xl text-alert">{totalAlerts}</div>
          <div className="font-mono text-[11px] text-ink-muted uppercase mt-1">Alerts raised (session)</div>
        </Panel>
        <Panel>
          <div className="font-display text-2xl text-signal">{fleetStatus.length}</div>
          <div className="font-mono text-[11px] text-ink-muted uppercase mt-1">Devices reporting</div>
        </Panel>
      </section>

      <section>
        <div className="font-mono text-[10px] text-ink-muted tracking-widest mb-3">DEVICE FLEET</div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {fleetStatus.length === 0 && (
            <Panel className="text-sm text-ink-muted">Waiting for the first flow…</Panel>
          )}
          {fleetStatus.map((d) => (
            <Panel key={d.deviceId} className={d.predictedAttack ? "border-alert/40" : ""}>
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-ink-primary">{d.deviceId}</div>
                {d.predictedAttack ? <SeverityBadge tier={d.severityTier} /> : (
                  <span className="font-mono text-[10px] text-signal">NORMAL</span>
                )}
              </div>
              <div className="font-body text-xs text-ink-muted mt-1">{d.deviceType.replace("_", " ")}</div>
              <div className="font-mono text-[10px] text-ink-faint mt-2">{timeAgo(d.timestamp)}</div>
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] text-ink-muted tracking-widest mb-3">ALERT FEED</div>
        <Panel className="p-0 overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto divide-y divide-hairline">
            {alerts.length === 0 && (
              <div className="p-6 text-sm text-ink-muted font-body">
                No alerts yet — network is quiet. Anomalous flows will appear here as they're scored.
              </div>
            )}
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface2/50">
                <div className="flex items-center gap-4">
                  <SeverityBadge tier={a.severityTier} />
                  <div>
                    <div className="font-body text-sm text-ink-primary">
                      {a.deviceId} <span className="text-ink-muted">· {a.attackTypeGuess?.replace("_", " ")}</span>
                    </div>
                    <div className="font-mono text-[11px] text-ink-faint">
                      confidence {(a.confidence * 100).toFixed(1)}% · {a.metrics.packetRate.toLocaleString()} pkt/s
                    </div>
                  </div>
                </div>
                <div className="font-mono text-[11px] text-ink-faint">{timeAgo(a.timestamp)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
