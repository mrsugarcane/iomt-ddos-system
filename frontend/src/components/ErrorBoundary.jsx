import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production this is where you'd ship the error to a logging
    // service (Sentry, etc.) — kept as a console line here since this
    // project has no external logging dependency wired up.
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-void px-6">
          <div className="max-w-md text-center">
            <div className="font-display text-2xl text-ink-primary mb-3">
              Something went wrong
            </div>
            <p className="font-body text-sm text-ink-muted mb-6">
              The dashboard hit an unexpected error. Your alert data on the server is unaffected —
              this is a display-layer problem only.
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
              className="px-5 py-2.5 rounded-md bg-signal text-void font-body text-sm font-medium"
            >
              Reload dashboard
            </button>
            <pre className="font-mono text-[10px] text-ink-faint mt-6 text-left overflow-x-auto">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
