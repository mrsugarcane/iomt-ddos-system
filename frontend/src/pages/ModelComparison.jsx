import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Panel from "../components/Panel";
import { fetchResults } from "../lib/api";

export default function ModelComparison() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResults().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Panel className="text-sm text-ink-muted">
        Could not load model results. Make sure the backend is running and the ML pipeline has been run.
      </Panel>
    );
  }
  if (!data) return <div className="text-ink-muted font-mono text-sm">Loading...</div>;

  const { models, best_model, optimization } = data;
  const f1Data = models.map((m) => ({ name: m.name, f1: m.f1_score, best: m.name === best_model }));
  const latencyData = models.map((m) => ({ name: m.name, latency: m.inference_latency_ms }));

  return (
    <div className="space-y-12">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">MODEL COMPARISON</div>
        <h1 className="font-display text-3xl text-ink-primary mb-4">
          Detection quality means little without a deployment budget
        </h1>
        <p className="font-body text-ink-muted leading-relaxed max-w-2xl">
          Every model below was trained and evaluated on the same held-out test split. The table reports
          security metrics alongside the two operational numbers that actually decide whether a model can
          run on a hospital gateway: per-sample inference latency and storage footprint.
        </p>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left font-mono text-[11px] text-ink-muted uppercase">
              <th className="py-3 pr-4">Model</th>
              <th className="py-3 pr-4">F1</th>
              <th className="py-3 pr-4">Precision</th>
              <th className="py-3 pr-4">Recall</th>
              <th className="py-3 pr-4">ROC-AUC</th>
              <th className="py-3 pr-4">Latency (ms)</th>
              <th className="py-3 pr-4">Size (KB)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {models.map((m) => (
              <tr
                key={m.name}
                className={`border-b border-hairline/50 ${
                  m.name === best_model ? "bg-signal/5" : ""
                }`}
              >
                <td className="py-3 pr-4 font-body text-ink-primary">
                  {m.name}
                  {m.name === best_model && (
                    <span className="ml-2 text-[10px] text-signal border border-signal/40 rounded px-1.5 py-0.5">
                      BEST
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink-primary">{m.f1_score.toFixed(3)}</td>
                <td className="py-3 pr-4 text-ink-muted">{m.precision.toFixed(3)}</td>
                <td className="py-3 pr-4 text-ink-muted">{m.recall.toFixed(3)}</td>
                <td className="py-3 pr-4 text-ink-muted">{m.roc_auc ? m.roc_auc.toFixed(3) : "—"}</td>
                <td className="py-3 pr-4 text-ink-muted">{m.inference_latency_ms.toFixed(3)}</td>
                <td className="py-3 pr-4 text-ink-muted">{m.model_size_kb.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <Panel eyebrow="DETECTION QUALITY" title="F1-score by model">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={f1Data} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke="#1B2230" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8B98A8", fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis domain={[0, 1]} tick={{ fill: "#8B98A8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#111723", border: "1px solid rgba(45,224,192,0.2)" }} />
                <Bar dataKey="f1" radius={[4, 4, 0, 0]}>
                  {f1Data.map((d) => (
                    <Cell key={d.name} fill={d.best ? "#29E0C0" : "#1B9C86"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="DEPLOYABILITY" title="Inference latency (ms / sample)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke="#1B2230" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8B98A8", fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fill: "#8B98A8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#111723", border: "1px solid rgba(45,224,192,0.2)" }} />
                <Bar dataKey="latency" fill="#FFB454" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      <section>
        <Panel eyebrow="EDGE OPTIMIZATION" title={`${optimization.model_name}: pruned + quantized for gateway deployment`}>
          <p className="font-body text-sm text-ink-muted mb-5 leading-relaxed">
            The best-performing deep model was pruned to {(optimization.sparsity_target * 100).toFixed(0)}%
            weight sparsity and quantized to int8, simulating what would ship to a constrained edge
            gateway such as a Raspberry Pi 4 (4GB RAM) class
            gateway.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="font-mono text-[11px] text-ink-muted uppercase mb-2">Size</div>
              <div className="font-display text-xl text-ink-primary">
                {optimization.baseline_size_kb.toFixed(1)} KB → <span className="text-signal">{optimization.optimized_size_kb.toFixed(1)} KB</span>
              </div>
              <div className="font-mono text-xs text-signal mt-1">
                −{optimization.size_reduction_pct.toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-ink-muted uppercase mb-2">F1-score</div>
              <div className="font-display text-xl text-ink-primary">
                {optimization.baseline_f1.toFixed(3)} → <span className="text-signal">{optimization.optimized_f1.toFixed(3)}</span>
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-ink-muted uppercase mb-2">Latency</div>
              <div className="font-display text-xl text-ink-primary">
                {optimization.baseline_latency_ms.toFixed(3)} → <span className="text-signal">{optimization.optimized_latency_ms.toFixed(3)}</span> ms
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
