/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: '#FAF9F6',
        ink: '#14151A',
        brand: {
          50: '#EEF3F8',
          100: '#D8E4EF',
          200: '#B2C9DF',
          300: '#8BADCE',
          400: '#4B7EAD',
          500: '#0F4C81',
          600: '#0D4271',
          700: '#0A3358',
          800: '#082440',
          900: '#051528',
        },
        gold: {
          50: '#FBF6EC',
          100: '#F3E5C6',
          200: '#E7CB8D',
          300: '#D7AD5E',
          400: '#C39A48',
          500: '#B8873D',
          600: '#9C7031',
          700: '#7A5726',
          800: '#583E1B',
          900: '#362510',
        },
        // Repalette the app's existing literal indigo-*/slate-* utility classes
        // (used across ~60 page files) to the new brand identity with zero per-file edits.
        indigo: {
          50: '#EEF3F8', 100: '#D8E4EF', 200: '#B2C9DF', 300: '#8BADCE', 400: '#4B7EAD',
          500: '#0F4C81', 600: '#0D4271', 700: '#0A3358', 800: '#082440', 900: '#051528', 950: '#030D18',
        },
        slate: {
          50: '#FAF9F6', 100: '#F2F0EB', 200: '#E4E1D9', 300: '#CFCABE', 400: '#A69F8E',
          500: '#7D7566', 600: '#5C564A', 700: '#433F37', 800: '#2A2823', 900: '#1C1A17', 950: '#14151A',
        },
      },
    },
  },
  plugins: [],
};
