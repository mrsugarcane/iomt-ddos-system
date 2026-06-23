import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Panel from "../components/Panel";
import StatTile from "../components/StatTile";
import { fetchResults } from "../lib/api";

const STAGES = [
  { n: "01", title: "Synthesize", body: "Simulate ECG, glucose, infusion pump, and pacemaker traffic, then inject volumetric, protocol, and application-layer DDoS windows." },
  { n: "02", title: "Train & compare", body: "Benchmark CNN, LSTM, autoencoder, and hybrid CNN-LSTM models against Random Forest and logistic regression baselines." },
  { n: "03", title: "Optimize", body: "Prune and quantize the best-performing model so it fits within edge-gateway memory and latency budgets." },
  { n: "04", title: "Monitor", body: "Score incoming flows in real time and route only risk-prioritized alerts to clinical staff." },
];

export default function Home() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResults().then(setStats).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-16">
      <section className="pt-6">
        <div className="font-mono text-[11px] text-signal tracking-widest mb-4">
          IoMT NETWORK SECURITY
        </div>
        <h1 className="font-display text-5xl leading-[1.08] text-ink-primary max-w-2xl">
          Predicting DDoS attacks on medical devices, before the alarm a clinician depends on goes silent.
        </h1>
        <p className="font-body text-ink-muted text-lg max-w-xl mt-6 leading-relaxed">
          A pacemaker, an infusion pump, a bedside monitor — each one is also a network endpoint.
          Sentinel-IoMT synthesizes realistic device traffic, benchmarks deep learning architectures
          against classical baselines on detection quality <em>and</em> deployability, then optimizes
          the winner to run on the gateway hardware actually found in a hospital network closet.
        </p>
        <div className="flex gap-3 mt-8">
          <Link
            to="/monitor"
            className="px-5 py-2.5 rounded-md bg-signal text-void font-body font-medium text-sm hover:bg-signal-glow transition-colors"
          >
            Watch the live monitor
          </Link>
          <Link
            to="/models"
            className="px-5 py-2.5 rounded-md border border-hairline text-ink-primary font-body text-sm hover:border-signal/40 transition-colors"
          >
            See model comparison
          </Link>
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] text-ink-muted tracking-widest mb-4">PIPELINE</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {STAGES.map((s) => (
            <Panel key={s.n} className="relative">
              <div className="font-mono text-signal/50 text-xs mb-3">{s.n}</div>
              <div className="font-display text-base text-ink-primary mb-2">{s.title}</div>
              <p className="font-body text-sm text-ink-muted leading-relaxed">{s.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] text-ink-muted tracking-widest mb-4">AT A GLANCE</div>
        {error && (
          <Panel className="text-sm text-ink-muted">
            Backend not reachable yet — start it and run the ML pipeline to populate these numbers
            (see the project README).
          </Panel>
        )}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Flows synthesized" value={stats.dataset_summary.n_flows.toLocaleString()} />
            <StatTile
              label="Attack share"
              value={(stats.dataset_summary.attack_fraction * 100).toFixed(1)}
              suffix="%"
            />
            <StatTile label="Models benchmarked" value={stats.models.length} />
            <StatTile
              label="Edge size reduction"
              value={stats.optimization.size_reduction_pct.toFixed(0)}
              suffix="%"
              accent
            />
          </div>
        )}
      </section>
    </div>
  );
}
