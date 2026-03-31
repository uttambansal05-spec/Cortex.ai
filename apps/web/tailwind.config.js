/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cortex design system
        background:   '#0A0A0B',
        surface:      '#111113',
        'surface-2':  '#18181B',
        'surface-3':  '#222226',
        border:       '#2A2A30',
        'border-2':   '#3A3A42',
        muted:        '#52525E',
        subtle:       '#71717D',
        foreground:   '#E4E4E7',
        'foreground-2': '#A1A1AA',
        accent:       '#6366F1',   // indigo — brain pulse
        'accent-2':   '#818CF8',
        success:      '#22C55E',
        warning:      '#F59E0B',
        danger:       '#EF4444',
        // Node type colors
        'node-entity':     '#6366F1',
        'node-decision':   '#8B5CF6',
        'node-risk':       '#EF4444',
        'node-gap':        '#F59E0B',
        'node-dependency': '#06B6D4',
        'node-flow':       '#22C55E',
        'node-api':        '#EC4899',
        'node-model':      '#F97316',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-departure-mono)', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'brain-build': 'brain-build 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'brain-build': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.98)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
        'brain-gradient': 'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
    },
  },
  plugins: [],
}
