/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0E14",
        surface: "#111723",
        surface2: "#161E2C",
        hairline: "rgba(45, 224, 192, 0.14)",
        signal: {
          DEFAULT: "#29E0C0",
          dim: "#1B9C86",
          glow: "#7BFCE6",
        },
        alert: {
          DEFAULT: "#FF4D5E",
          dim: "#7A2230",
        },
        triage: {
          DEFAULT: "#FFB454",
          dim: "#7A5A23",
        },
        ink: {
          primary: "#E6EDF3",
          muted: "#8B98A8",
          faint: "#54627A",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        signal: "0 0 0 1px rgba(45,224,192,0.18), 0 8px 30px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "grain": "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
