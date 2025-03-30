// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config = {
  darkMode: "class", // Habilitar modo escuro baseado em classe
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}', // Adicionado src caso existam componentes lá
  ],
  prefix: '', // Manter prefixo vazio conforme padrão Shadcn
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))', // Referencia variável CSS
        input: 'hsl(var(--input))', // Referencia variável CSS
        ring: 'hsl(var(--ring))', // Referencia variável CSS
        background: 'hsl(var(--background))', // Referencia variável CSS
        foreground: 'hsl(var(--foreground))', // Referencia variável CSS
        primary: {
          DEFAULT: 'hsl(var(--primary))', // Referencia variável CSS
          foreground: 'hsl(var(--primary-foreground))', // Referencia variável CSS
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))', // Referencia variável CSS
          foreground: 'hsl(var(--secondary-foreground))', // Referencia variável CSS
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))', // Referencia variável CSS
          foreground: 'hsl(var(--destructive-foreground))', // Referencia variável CSS
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))', // Referencia variável CSS
          foreground: 'hsl(var(--muted-foreground))', // Referencia variável CSS
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))', // Referencia variável CSS
          foreground: 'hsl(var(--accent-foreground))', // Referencia variável CSS
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))', // Referencia variável CSS
          foreground: 'hsl(var(--popover-foreground))', // Referencia variável CSS
        },
        card: {
          DEFAULT: 'hsl(var(--card))', // Referencia variável CSS
          foreground: 'hsl(var(--card-foreground))', // Referencia variável CSS
        },
      },
      borderRadius: {
        lg: 'var(--radius)', // Usa variável CSS do raio
        md: 'calc(var(--radius) - 2px)', // Usa variável CSS do raio
        sm: 'calc(var(--radius) - 4px)', // Usa variável CSS do raio
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'], // Usa variável CSS da fonte
        mono: ['var(--font-geist-mono)'], // Usa variável CSS da fonte
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')], // Plugin padrão do Shadcn
} satisfies Config

export default config