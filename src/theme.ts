import { createTheme, type MantineThemeOverride } from '@mantine/core';

/**
 * Signal Blue — the single interactive accent for SC PTZ Control.
 * Anchored at shade 6 (#1971c2) for light mode, shade 7 for dark mode.
 */
const signalBlue: [string, string, string, string, string, string, string, string, string, string] = [
  '#e8f4fd',
  '#cce8fb',
  '#a3d5f7',
  '#74bef2',
  '#4da8ec',
  '#2e93e4',
  '#1971c2', // Signal Blue — primary anchor
  '#155ba3',
  '#114987',
  '#0d3a6e',
];

const theme: MantineThemeOverride = createTheme({
  primaryColor: 'signalBlue',
  primaryShade: { light: 6, dark: 7 },

  colors: {
    signalBlue,
  },

  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Cascadia Code", Consolas, monospace',

  defaultRadius: 'sm',

  headings: {
    fontWeight: '700',
    sizes: {
      h1: { fontSize: 'clamp(1.75rem, 3vw, 2rem)', lineHeight: '1.3' },
      h2: { fontSize: 'clamp(1.5rem, 2.5vw, 1.75rem)', lineHeight: '1.3' },
      h3: { fontSize: 'clamp(1.25rem, 2vw, 1.5rem)', lineHeight: '1.35' },
      h4: { fontSize: '1.125rem', lineHeight: '1.4' },
    },
  },

  fontSizes: {
    xs: '10px',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '18px',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },

  radius: {
    xs: '2px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.25)',
    md: '0 4px 8px rgba(0, 0, 0, 0.3)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.35)',
    xl: '0 12px 24px rgba(0, 0, 0, 0.4)',
  },

  luminanceThreshold: 0.3,
  autoContrast: true,

  components: {
    Button: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Card: {
      defaultProps: {
        padding: 'md',
        radius: 'md',
      },
    },
    Input: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Tooltip: {
      defaultProps: {
        withArrow: true,
        openDelay: 300,
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true,
      },
    },
  },
});

export default theme;
