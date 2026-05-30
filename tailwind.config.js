/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glass: "0 8px 30px rgba(0, 0, 0, 0.12)",
      },
      keyframes: {
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        floatUp: "floatUp 300ms ease-out",
      },
    },
  },
  plugins: [],
};
