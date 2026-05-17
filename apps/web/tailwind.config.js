/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#1a1d23",
          raised: "#22262e",
          border: "#2f3540",
        },
        accent: {
          DEFAULT: "#3d8bfd",
          muted: "#2a5a9e",
        },
      },
    },
  },
  plugins: [],
};
