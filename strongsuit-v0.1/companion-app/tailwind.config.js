/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        iron: { 950: 'var(--iron-950)', 700: 'var(--iron-700)', 400: 'var(--iron-400)', 200: 'var(--iron-200)' },
        bone: { 50: 'var(--bone-50)', 0: 'var(--bone-0)' },
        verde: { 600: 'var(--verde-600)', 700: 'var(--verde-700)', 100: 'var(--verde-100)' },
        ember: { 500: 'var(--ember-500)', 600: 'var(--ember-600)' },
        signal: { 600: 'var(--signal-red-600)' },
        surface: 'var(--surface)', surface2: 'var(--surface-2)',
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)', line: 'var(--line)',
        nav: {
          DEFAULT: 'var(--nav)',
          lift: 'var(--nav-lift)',
          text: 'var(--nav-text)',
          muted: 'var(--nav-muted)',
          faint: 'var(--nav-faint)',
          line: 'var(--nav-line)',
          spine: 'var(--nav-spine)',
        },
      },
      fontFamily: {
        display: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { ctl: '6px', card: '10px' },
      boxShadow: {
        raise: '0 1px 2px rgb(23 26 30 / 6%)',
        bench: '0 1px 0 rgb(23 26 30 / 4%), 0 8px 24px rgb(21 94 78 / 8%)',
      },
      keyframes: {
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        'ember-pulse': {
          '0%, 100%': { opacity: '0.55', transform: 'scaleX(1)' },
          '50%': { opacity: '1', transform: 'scaleX(1.08)' },
        },
        'tab-pop': {
          '0%': { transform: 'scale(0.92)', opacity: '0.6' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.45s cubic-bezier(0.2,0,0,1) both',
        'float-soft': 'float-soft 3.2s cubic-bezier(0.2,0,0,1) infinite',
        'ember-pulse': 'ember-pulse 2.4s cubic-bezier(0.2,0,0,1) infinite',
        'tab-pop': 'tab-pop 0.28s cubic-bezier(0.2,0,0,1) both',
      },
      fontSize: { '2xs': ['12px', '16px'], xs: ['13px', '18px'], sm: ['14px', '21px'], base: ['16px', '24px'], lg: ['18px', '26px'], xl: ['22px', '28px'] },
    },
  },
  plugins: [],
}
