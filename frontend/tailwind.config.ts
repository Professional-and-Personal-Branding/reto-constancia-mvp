import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

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
      // Cada color es una variable con canales RGB (paletas en app/globals.css, una por tema).
      // Así siguen funcionando los modificadores de opacidad como bg-ok/15.
      colors: {
        bg: {
          DEFAULT: token('bg'),
          card: token('bg-card'),
          elev: token('bg-elev'),
        },
        line: token('line'),
        ink: {
          DEFAULT: token('ink'),
          dim: token('ink-dim'),
          mute: token('ink-mute'),
        },
        accent: {
          DEFAULT: token('accent'), // naranja deportivo
          dark: token('accent-dark'),
        },
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },
    },
  },
  plugins: [],
};

export default config;
