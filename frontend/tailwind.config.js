export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
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
