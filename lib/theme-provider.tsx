"use client";

import React from "react";
import { ThemeProvider } from "styled-components";
import { MotionConfig } from "framer-motion";
import { theme } from "./theme";
import { GlobalStyle } from "./global-style";
import { ExplorerProvider } from "./store";

/** Client-side providers: styled-components theme, global styles, app store. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <MotionConfig reducedMotion="user">
        <ExplorerProvider>{children}</ExplorerProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
