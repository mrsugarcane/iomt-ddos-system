import React from "react";

export default function StatTile({ label, value, suffix = "", accent = false }) {
  return (
    <div className="bg-surface/60 border border-hairline rounded-lg px-5 py-4">
      <div className={`font-display text-3xl ${accent ? "text-signal" : "text-ink-primary"}`}>
        {value}
        <span className="text-base text-ink-muted ml-1">{suffix}</span>
      </div>
      <div className="font-mono text-[11px] text-ink-muted tracking-wide mt-1 uppercase">
        {label}
      </div>
    </div>
  );
}
