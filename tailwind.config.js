/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "media",
  content: ["./**/*.tsx"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#D97756",
          hover: "#C4623E",
          bg: "rgba(217,119,86,0.08)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Noto Sans SC",
          "sans-serif",
        ],
      },
    },
  },
}
