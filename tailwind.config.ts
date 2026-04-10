import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        momah: {
          'dark-green': '#045859',
          'light-green': '#87ba26',
          grey: '#54565b',
          teal: '#00a79d',
          orange: '#c05728',
          gold: '#FFC845',
        },
        edgs: {
          primary: '#045859',
          secondary: '#87ba26',
          accent: '#00a79d',
          success: '#87ba26',
          warning: '#FFC845',
          danger: '#c05728',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['Tajawal', 'system-ui', 'sans-serif'],
        english: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  future: {
    hoverOnlyWhenSupported: true,
  },
};

export default config;
