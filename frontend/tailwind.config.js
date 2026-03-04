/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#7c3aed',
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#f59e0b',
        appbg: '#f6f7fb',
        cardbg: '#ffffff'
      },
      boxShadow: {
        card: '0 8px 24px rgba(15, 23, 42, 0.08)'
      },
      maxWidth: {
        app: '480px'
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out'
      }
    }
  },
  plugins: []
};

