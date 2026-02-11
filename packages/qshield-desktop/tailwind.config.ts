import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        trust: {
          verified: '#10b981',
          normal: '#0ea5e9',
          elevated: '#f59e0b',
          warning: '#f97316',
          critical: '#ef4444',
        },
        surface: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          border: '#334155',
        },
      },
      animation: {
        'shield-breathe': 'breathe var(--breathe-duration, 3s) ease-in-out infinite',
        'shield-pulse': 'pulse 0.8s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
