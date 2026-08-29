/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral: {
          0: "#FFFFFF",
          50: "#F7F8FA",
          100: "#EEF0F3",
          200: "#DDE1E6",
          300: "#C3C9D1",
          500: "#6B7280",
          700: "#374151",
          900: "#111827"
        },
        navy: {
          50: "#EEF3FA",
          500: "#1D4E89",
          700: "#13355E",
          900: "#0B2545"
        },
        status: {
          success: "#1B7A43",
          "success-bg": "#E6F4EA",
          running: "#B5860B",
          "running-bg": "#FBF2DD",
          error: "#B3261E",
          "error-bg": "#FBEAE9",
          info: "#1D4E89"
        },
        synthetic: {
          flag: "#6D4AAF"
        },
        map: {
          slick: "#3A3A3A",
          "source-low": "#EEF3FA",
          "source-mid": "#1D4E89",
          "source-high": "#0B2545",
          forecast: "#B5860B",
          trajectory: "#6B7280",
          "vessel-top": "#B3261E",
          "vessel-shortlisted": "#B5860B",
          "vessel-background": "#C3C9D1"
        }
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"]
      },
      fontSize: {
        display: ["28px", { lineHeight: "36px", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "28px", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "16px", fontWeight: "400" }],
        mono: ["13px", { lineHeight: "20px", fontWeight: "400" }]
      },
      boxShadow: {
        "elevation-1": "0 4px 12px rgba(17,24,39,0.08)"
      }
    }
  },
  plugins: []
};
