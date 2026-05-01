export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0f0f0f', card: '#1a1a1a', hover: '#222222' },
        border: '#2a2a2a',
        accent: { DEFAULT: '#7c3aed', light: '#8b5cf6', glow: '#6d28d9' },
        text: { primary: '#f1f5f9', secondary: '#94a3b8', muted: '#475569' },
        status: {
          waiting:    '#475569',
          progress:   '#f59e0b',
          done:       '#10b981',
          reviewed:   '#7c3aed',
          error:      '#ef4444',
        }
      }
    }
  },
  plugins: []
}
