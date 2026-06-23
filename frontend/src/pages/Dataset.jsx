import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Panel from "../components/Panel";
import { fetchResults } from "../lib/api";

const ATTACK_LABELS = { 0: "Benign", 1: "Volumetric", 2: "Protocol", 3: "App-layer" };
const ATTACK_COLORS = { 0: "#1B9C86", 1: "#FF4D5E", 2: "#FFB454", 3: "#7BFCE6" };

const DEVICE_LABELS = {
  ecg_wearable: "ECG wearable",
  glucose_sensor: "Glucose sensor",
  infusion_pump: "Infusion pump",
  pacemaker: "Pacemaker",
};

export default function Dataset() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResults().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Panel className="text-sm text-ink-muted">
        Could not load the dataset summary. Make sure the backend is running and the ML pipeline has
        produced results (see the project README).
      </Panel>
    );
  }
  if (!data) return <div className="text-ink-muted font-mono text-sm">Loading...</div>;

  const summary = data.dataset_summary;
  const deviceData = Object.entries(summary.device_types).map(([k, v]) => ({
    name: DEVICE_LABELS[k] || k,
    flows: v,
  }));
  const attackData = Object.entries(summary.attack_type_counts).map(([k, v]) => ({
    name: ATTACK_LABELS[k] || k,
    flows: v,
    code: Number(k),
  }));

  return (
    <div className="space-y-12">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">DATASET & METHODOLOGY</div>
        <h1 className="font-display text-3xl text-ink-primary mb-4">
          A synthetic IoMT traffic corpus, built device-first
        </h1>
        <p className="font-body text-ink-muted leading-relaxed max-w-2xl">
          No public dataset captures real medical-device traffic at scale, so this study generates its
          own: each of four device archetypes transmits on its own realistic cadence — a wearable ECG
          streaming every few seconds, a glucose sensor reporting every few minutes, an infusion pump
          mostly idle between dosage updates, a pacemaker silent until an event triggers a burst. A
          subset of sessions then receive an injected attack window — volumetric flooding, a protocol-level
          half-open connection flood, or a slow application-layer request flood — with a ramp-up and
          cool-down rather than an instant on/off switch, so the boundary a model has to learn isn't
          artificially clean.
        </p>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <Panel eyebrow="TRAFFIC BY DEVICE" title="Flow volume per device archetype">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deviceData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke="#1B2230" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8B98A8", fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#8B98A8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#111723", border: "1px solid rgba(45,224,192,0.2)" }} />
                <Bar dataKey="flows" fill="#29E0C0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="LABEL BREAKDOWN" title="Flows by class">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attackData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke="#1B2230" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8B98A8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#8B98A8", fontSize: 11 }} scale="log" domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#111723", border: "1px solid rgba(45,224,192,0.2)" }} />
                <Bar dataKey="flows" radius={[4, 4, 0, 0]}>
                  {attackData.map((d) => (
                    <Cell key={d.code} fill={ATTACK_COLORS[d.code]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="font-mono text-[11px] text-ink-faint mt-2">log scale — attacks are intentionally rare</p>
        </Panel>
      </section>

      <section>
        <Panel eyebrow="FEATURE EXTRACTION" title={`${summary.feature_columns.length} per-flow features`}>
          <p className="font-body text-sm text-ink-muted mb-4 leading-relaxed">
            Every flow is reduced to a CICFlowMeter-style feature vector before reaching a model —
            volumetric and timing statistics, protocol flags, and short-term temporal context.
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.feature_columns.map((f) => (
              <span
                key={f}
                className="font-mono text-[11px] px-2.5 py-1 rounded bg-surface2 border border-hairline text-ink-primary"
              >
                {f}
              </span>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <Panel>
          <div className="font-display text-2xl text-signal">{summary.n_flows.toLocaleString()}</div>
          <div className="font-mono text-[11px] text-ink-muted mt-1 uppercase">Total flows</div>
        </Panel>
        <Panel>
          <div className="font-display text-2xl text-signal">{summary.window_size}</div>
          <div className="font-mono text-[11px] text-ink-muted mt-1 uppercase">Window size (sequence models)</div>
        </Panel>
        <Panel>
          <div className="font-display text-2xl text-signal">{summary.n_sequence_windows.toLocaleString()}</div>
          <div className="font-mono text-[11px] text-ink-muted mt-1 uppercase">Sliding-window sequences</div>
        </Panel>
      </section>
    </div>
  );
}
