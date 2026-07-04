/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',
        panelBg: '#111827',
        borderSlate: '#1f2937',
      }
    },
  },
  plugins: [],
}
