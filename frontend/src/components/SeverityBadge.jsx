import React from "react";

const STYLES = {
  Critical: "bg-alert/15 text-alert border-alert/40",
  High: "bg-triage/15 text-triage border-triage/40",
  Medium: "bg-signal/10 text-signal border-signal/30",
  Low: "bg-surface2 text-ink-muted border-hairline",
};

export default function SeverityBadge({ tier }) {
  const style = STYLES[tier] || STYLES.Low;
  return (
    <span className={`font-mono text-[10px] tracking-wider px-2 py-1 rounded border ${style}`}>
      {tier.toUpperCase()}
    </span>
  );
}
