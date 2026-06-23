import React, { useEffect, useRef } from "react";
import { useLiveFeed } from "../lib/LiveFeedContext";

// Keyframes describing one heartbeat cycle as [phase 0-1, normalized amplitude]
const ECG_KEYFRAMES = [
  [0.0, 0], [0.08, 0], [0.1, 0.12], [0.12, 0], [0.17, 0],
  [0.19, -0.15], [0.205, 1.0], [0.22, -0.35], [0.26, 0],
  [0.34, 0], [0.39, 0.22], [0.46, 0], [1.0, 0],
];

function ecgValue(phase) {
  for (let i = 0; i < ECG_KEYFRAMES.length - 1; i++) {
    const [p0, v0] = ECG_KEYFRAMES[i];
    const [p1, v1] = ECG_KEYFRAMES[i + 1];
    if (phase >= p0 && phase <= p1) {
      const t = (phase - p0) / (p1 - p0 || 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return 0;
}

export default function PulseGrid() {
  const canvasRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const offsetRef = useRef(0);
  const pulseRef = useRef({ until: 0, tier: null });
  const { latestEvent } = useLiveFeed();

  useEffect(() => {
    if (!latestEvent || !latestEvent.predictedAttack) return;
    if (latestEvent.severityTier === "Critical" || latestEvent.severityTier === "High") {
      pulseRef.current = { until: performance.now() + 1600, tier: latestEvent.severityTier };
    }
  }, [latestEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const gridCanvas = document.createElement("canvas");
    gridCanvasRef.current = gridCanvas;
    const gctx = gridCanvas.getContext("2d");

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      [canvas, gridCanvas].forEach((c) => {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      gctx.clearRect(0, 0, w, h);
      const spacing = 42;
      for (let x = 0; x < w; x += spacing) {
        for (let y = 0; y < h; y += spacing) {
          gctx.beginPath();
          gctx.arc(x, y, 1, 0, Math.PI * 2);
          gctx.fillStyle = "rgba(139, 152, 168, 0.10)";
          gctx.fill();
        }
      }
    }
    resize();
    window.addEventListener("resize", resize);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(gridCanvas, 0, 0, w, h);

      const now = performance.now();
      const pulsing = now < pulseRef.current.until;
      const pulseT = pulsing ? 1 - (pulseRef.current.until - now) / 1600 : 0;
      const flash = pulsing ? Math.sin(pulseT * Math.PI) : 0;

      const period = 230;
      const amplitudeBase = h * 0.045 * (1 + flash * 1.4);
      const baselineY = h * 0.74;
      const color = pulsing && pulseRef.current.tier === "Critical"
        ? `rgba(255, 77, 94, ${0.28 + flash * 0.45})`
        : pulsing && pulseRef.current.tier === "High"
          ? `rgba(255, 180, 84, ${0.26 + flash * 0.4})`
          : "rgba(41, 224, 192, 0.30)";

      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 2) {
        const phase = (((x + offsetRef.current) % period) / period + 1) % 1;
        const v = ecgValue(phase);
        const y = baselineY - v * amplitudeBase;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (!reduceMotion) offsetRef.current += 1.3;
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: "#0A0E14" }}
    />
  );
}
