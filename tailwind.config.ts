import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 運行ダッシュボードの状態色（仕様書 F-15: 稼働=緑 / 終業=橙）
        status: {
          active: "#16a34a",
          done: "#ea580c",
          warning: "#dc2626",
          idle: "#64748b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
