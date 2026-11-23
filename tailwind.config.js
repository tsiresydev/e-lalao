/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Le CSS historique reste la source de vérité pour le shell et les plateaux.
  // Tailwind est ajouté uniquement pour ses utilitaires, sans reset global.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
