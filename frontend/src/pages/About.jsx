import React from "react";
import Panel from "../components/Panel";

export default function About() {
  return (
    <div className="space-y-10 max-w-2xl">
      <section>
        <div className="font-mono text-[11px] text-signal tracking-widest mb-3">ABOUT</div>
        <h1 className="font-display text-3xl text-ink-primary mb-4">Why this exists</h1>
        <p className="font-body text-ink-muted leading-relaxed">
          Medical devices increasingly talk to hospital networks — and to each other. A DDoS attack
          against that traffic doesn't just slow down a web page; it can delay or silence an alert tied
          to a person's vital signs. Most published intrusion-detection research validates deep learning
          models on generic IoT traffic, not on the device-specific, often life-critical patterns found
          in a clinical setting, and rarely reports whether the winning model could actually run on the
          gateway hardware sitting in a hospital network closet. This project implements that fuller
          picture end to end: synthesize IoMT-realistic traffic, benchmark several architectures on both
          detection quality and deployability, optimize the winner, and wire it into a live monitoring
          view with risk-prioritized alerting.
        </p>
      </section>

      <Panel eyebrow="A NOTE ON IMPLEMENTATION" title="Why the models are hand-built in NumPy">
        <p className="font-body text-sm text-ink-muted leading-relaxed">
          The environment this was built in has no internet access and no TensorFlow/PyTorch installed,
          so the four architectures — CNN, LSTM, autoencoder, hybrid CNN-LSTM — are implemented as a
          small from-scratch NumPy neural network engine with real forward/backward propagation and Adam
          optimization, not a simulation of training. The trained CNN weights are exported to JSON and
          re-used by the Node.js backend for live inference (<code className="font-mono text-xs">deepInference.js</code>),
          meaning the monitoring dashboard runs the actual trained model, not a substitute. To switch
          to TensorFlow or PyTorch, replace the models in{" "}
          <code className="font-mono text-xs">models.py</code> — the architectures translate directly.
        </p>
      </Panel>

      <Panel eyebrow="HARDWARE TARGET" title="Raspberry Pi 4 (4GB RAM) — not a microcontroller">
        <p className="font-body text-sm text-ink-muted leading-relaxed">
          The source research specifies a Raspberry Pi 4 (4 GB RAM) running Linux as the target edge
          gateway. Pruning and int8 quantization reduce the best model from ~36 KB to ~6 KB, well
          within that budget. Earlier versions of this documentation incorrectly stated ARM Cortex-M
          (a bare-metal microcontroller with kilobytes of memory) — that has been corrected throughout.
        </p>
      </Panel>

      <Panel eyebrow="FEATURE EXTRACTION" title="Custom simulator vs. CICFlowMeter + Cooja/OMNeT++">
        <p className="font-body text-sm text-ink-muted leading-relaxed">
          The paper specifies generating normal traffic via Cooja/OMNeT++ network simulators and
          extracting features using CICFlowMeter on captured pcap files. This implementation replaces
          both with a Python simulator that produces flow records directly in the same feature schema
          (duration, packet/byte rates, protocol flags, inter-arrival statistics). The feature
          categories are identical; the data-generation toolchain is not. To close this gap: capture
          pcap traffic from Cooja or OMNeT++, run CICFlowMeter on it, and feed the resulting CSV into{" "}
          <code className="font-mono text-xs">dataset_builder.py</code> in place of the synthesized flows.
        </p>
      </Panel>

      <Panel eyebrow="A NOTE ON THE BACKGROUND" title="Canvas background wired to system state">
        <p className="font-body text-sm text-ink-muted leading-relaxed">
          Rather than dropping in stock footage, every page's background is an animated canvas: a
          continuous ECG-style waveform over a faint telemetry grid that visibly spikes when a
          high-severity alert arrives on the live feed — a background wired to real system state.
          To swap in a literal video file, drop an .mp4 into{" "}
          <code className="font-mono text-xs">frontend/public/</code> and replace the canvas in{" "}
          <code className="font-mono text-xs">PulseGrid.jsx</code> with a{" "}
          <code className="font-mono text-xs">&lt;video&gt;</code> element.
        </p>
      </Panel>
    </div>
  );
}
