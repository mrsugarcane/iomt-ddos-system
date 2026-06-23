import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import Panel from "../components/Panel";
import { fetchResults } from "../lib/api";

export default function Explainability() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResults().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Panel className="text-sm text-ink-muted">
        Could not load explainability data. Make sure the backend is running and the pipeline has
        been run.
      </Panel>
    );
  }
  if (!data) return <div className="text-ink-muted font-mono text-sm">Loading…</div>;

  const exp = data.explainability;
  if (!exp) return (
    <Panel className="text-sm text-ink-muted">
      Explainability data not found in results. Re-run the ML pipeline.
    </Panel>
  );

  const ranked = [...exp.ranking].sort((a, b) => b.importance - a.importance);
  const max = ranked[0]?.importance || 1;

  return (
    <div className="space-y-12">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">
          EXPLAINABILITY
        </div>
        <h1 className="font-display text-3xl text-ink-primary mb-4">
          Which features drive attack detection?
        </h1>
        <p className="font-body text-ink-muted leading-relaxed max-w-2xl">
          Permutation importance measures how much detection quality (F1-score) drops when a single
          feature is randomly shuffled across the test set, breaking its relationship with the label.
          A large drop means the model depends on that feature heavily; a drop near zero means the
          model can compensate with other features. This is a SHAP substitute — the paper references
          SHAP, which can be swapped in once the <code className="font-mono text-xs">shap</code>{" "}
          package is installable (see{" "}
          <code className="font-mono text-xs">ml-pipeline/src/explainability.py</code> for
          instructions).
        </p>
      </section>

      <Panel eyebrow="PERMUTATION IMPORTANCE" title={`Model: ${data.best_model} — baseline F1 = ${exp.baseline_f1.toFixed(4)}`}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={ranked}
              layout="vertical"
              margin={{ left: 160, right: 20, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke="#1B2230" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, max * 1.1]}
                tick={{ fill: "#8B98A8", fontSize: 11 }}
                tickFormatter={(v) => v.toFixed(2)}
              />
              <YAxis
                dataKey="feature"
                type="category"
                tick={{ fill: "#E6EDF3", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                width={155}
              />
              <Tooltip
                contentStyle={{
                  background: "#111723",
                  border: "1px solid rgba(45,224,192,0.2)",
                  fontFamily: "IBM Plex Mono",
                  fontSize: 12,
                }}
                formatter={(v) => [`Δf1 = ${v.toFixed(5)}`, "Importance"]}
              />
              <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                {ranked.map((d, i) => (
                  <Cell
                    key={d.feature}
                    fill={
                      i === 0
                        ? "#29E0C0"
                        : i < 3
                        ? "#1B9C86"
                        : i < 6
                        ? "#FFB454"
                        : "#54627A"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <section className="grid md:grid-cols-3 gap-4">
        {ranked.slice(0, 3).map((d, i) => (
          <Panel key={d.feature}>
            <div className="font-mono text-[10px] text-signal tracking-widest mb-1">
              #{i + 1} MOST IMPORTANT
            </div>
            <div className="font-display text-xl text-ink-primary">{d.feature}</div>
            <div className="font-mono text-sm text-ink-muted mt-2">
              Δf1 = {d.importance.toFixed(5)}
            </div>
          </Panel>
        ))}
      </section>

      <Panel eyebrow="SHAP UPGRADE NOTE" className="border-triage/20">
        <p className="font-body text-sm text-ink-muted leading-relaxed">
          The paper's literature review references SHAP (SHapley Additive exPlanations) for
          per-prediction local attribution. To upgrade: install{" "}
          <code className="font-mono text-xs">pip install shap</code>, then replace the
          permutation loop in{" "}
          <code className="font-mono text-xs">explainability.py</code> with a SHAP{" "}
          <code className="font-mono text-xs">Explainer</code> — the result dict format stays the
          same and this page will display SHAP values without any further changes.
        </p>
      </Panel>
    </div>
  );
}
