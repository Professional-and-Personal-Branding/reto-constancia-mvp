import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          DEFAULT: '#0a0a0a',
          card: '#171717',
          elev: '#1f1f1f',
        },
        line: '#262626',
        ink: {
          DEFAULT: '#fafafa',
          dim: '#a3a3a3',
          mute: '#737373',
        },
        accent: {
          DEFAULT: '#ff6b35', // naranja deportivo
          dark: '#e85a28',
        },
        ok: '#84cc16',
        warn: '#facc15',
        bad: '#ef4444',
      },
    },
  },
  plugins: [],
};

export default config;
