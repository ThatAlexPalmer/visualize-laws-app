"use client";

// STUB (owned by agent-ui). Replace with the animated (framer-motion) modal that
// shows the full law text + scores. Driven by store.selectedLaw / closeLaw.
import styled from "styled-components";
import { useExplorer } from "@/lib/store";
import { stateName } from "@/lib/types";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.z.modal};
`;

const Card = styled.div`
  max-width: 720px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space(6)};
`;

export function LawModal() {
  const { state, dispatch } = useExplorer();
  const law = state.selectedLaw;
  if (!law) return null;
  return (
    <Overlay onClick={() => dispatch({ type: "closeLaw" })}>
      <Card onClick={(e) => e.stopPropagation()}>
        <h3>{law.header ?? "Untitled provision"}</h3>
        <p style={{ opacity: 0.6 }}>
          {stateName(law.state)}
          {law.city ? ` · ${law.city}` : ""}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>{law.content}</p>
      </Card>
    </Overlay>
  );
}
