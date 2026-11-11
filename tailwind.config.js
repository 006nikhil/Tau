/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#0a1411', 900: '#0f1c18', 850: '#13231e', 800: '#182b25', 700: '#213830', 600: '#2d4a40', 500: '#3f5f53' },
        gain: { DEFAULT: '#6fd6a0', soft: '#6fd6a01f' },
        sip: { DEFAULT: '#7eb6ff', soft: '#7eb6ff1f' },
        loss: { DEFAULT: '#f27d72', soft: '#f27d721f' },
        tau: { DEFAULT: '#d9b25f', soft: '#d9b25f1f' },
      },
      boxShadow: { card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)' },
    },
  },
  plugins: [],
};
