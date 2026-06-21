"use client";

import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }

  :root {
    color-scheme: dark;
  }

  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.fg};
    font-family: ${({ theme }) => theme.font.sans};
    font-size: ${({ theme }) => theme.fontSize.md};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }

  ::selection { background: #fff; color: #000; }

  /* Minimal monochrome scrollbars */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.g20};
    border-radius: ${({ theme }) => theme.radius.pill};
  }
  ::-webkit-scrollbar-thumb:hover { background: ${({ theme }) => theme.colors.g60}; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
    }
  }
`;
