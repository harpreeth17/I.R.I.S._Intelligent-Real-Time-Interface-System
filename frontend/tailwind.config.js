export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.35' }],
        sm: ['0.9375rem', { lineHeight: '1.45' }],
        base: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.45' }],
        xl: ['1.5rem', { lineHeight: '1.3' }],
        '2xl': ['1.75rem', { lineHeight: '1.25' }],
      },
      colors: {
        irisBg: '#0a0f1e',
        irisPanel: '#111b33',
        irisAccent: '#4fc3f7',
        irisSoft: '#90caf9'
      },
      boxShadow: {
        glow: '0 0 20px rgba(79, 195, 247, 0.35)'
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.75' },
          '50%': { transform: 'scale(1.08)', opacity: '1' }
        }
      },
      animation: {
        pulseGlow: 'pulseGlow 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
