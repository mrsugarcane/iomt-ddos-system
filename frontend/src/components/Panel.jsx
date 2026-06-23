import React from "react";

export default function Panel({ children, className = "", title, eyebrow }) {
  return (
    <div className={`bg-surface/80 border border-hairline rounded-lg p-6 ${className}`}>
      {eyebrow && (
        <div className="font-mono text-[10px] text-signal tracking-widest mb-1">{eyebrow}</div>
      )}
      {title && <h3 className="font-display text-lg text-ink-primary mb-3">{title}</h3>}
      {children}
    </div>
  );
}
