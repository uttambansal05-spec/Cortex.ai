/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-0': '#0F1114',
        'bg-1': '#151820',
        'bg-2': '#1C2028',
        'bg-3': '#252A35',
        'bg-4': '#2E3442',
        accent: '#10B981',
        'accent-hover': '#34D399',
        'accent-muted': 'rgba(16,185,129,0.10)',
        'accent-border': 'rgba(16,185,129,0.20)',
        'text-0': '#F1F5F9',
        'text-1': '#94A3B8',
        'text-2': '#64748B',
        'text-3': '#475569',
        border: 'rgba(148,163,184,0.08)',
        'border-hover': 'rgba(148,163,184,0.16)',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        // Legacy aliases for components that still reference old names
        background: '#0F1114',
        surface: '#151820',
        'surface-2': '#1C2028',
        'surface-3': '#252A35',
        foreground: '#F1F5F9',
        'foreground-2': '#94A3B8',
        muted: '#64748B',
        subtle: '#475569',
        'border-2': 'rgba(148,163,184,0.16)',
        'accent-2': '#34D399',
      },
      fontFamily: {
        sans: ["'DM Sans'", 'system-ui', 'sans-serif'],
        display: ["'Outfit'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'var(--font-mono)', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'brain-build': 'brain-build 2s ease-in-out infinite',
        'fade-in': 'fadeUp 0.3s ease-out',
        'slide-up': 'fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 2s ease-in-out infinite',
      },
      keyframes: {
        'brain-build': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.98)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
    },
  },
  plugins: [],
}
