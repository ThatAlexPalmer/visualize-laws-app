"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { TopNav } from "@/components/nav/TopNav";

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
`;

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <Frame>
      <TopNav />
      <Content>{children}</Content>
    </Frame>
  );
}
