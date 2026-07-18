import { AXES } from "@/lib/types";
import { theme } from "@/lib/theme";

const LABELS = ["OPACITY", "WIGGLE ROOM", "PATERNALISM", "SALIENCE"];

function SocialMark() {
  return (
    <svg width="112" height="112" viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" fill="#000000" />
      <path d="M112 112h224l64 64H176z" fill="#4D4D4D" />
      <path d="M112 208h224l64 64H176z" fill="#999999" />
      <path d="M112 304h224l64 64H176z" fill="#FFFFFF" />
      <path d="M304 304h32l64 64h-32z" fill="#E53E3E" />
    </svg>
  );
}

export function SocialCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: theme.colors.bg,
        color: theme.colors.fg,
        padding: "56px 64px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${theme.colors.g20}`,
          paddingBottom: "36px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <SocialMark />
          <div
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: "25px",
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            VISUALIZE LAWS
          </div>
        </div>
        <div
          style={{
            display: "flex",
            color: theme.colors.g68,
            fontFamily: "monospace",
            fontSize: "18px",
            letterSpacing: "0.08em",
          }}
        >
          VISUALIZELAWS.COM
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
        <div
          style={{
            display: "flex",
            maxWidth: "980px",
            fontSize: "76px",
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.045em",
          }}
        >
          THE FINE PRINT HAS A MAP NOW.
        </div>
        <div style={{ display: "flex", color: theme.colors.g76, fontSize: "27px" }}>
          Search and map 2.2 million U.S. local laws.
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        {AXES.map((axis, index) => (
          <div
            key={axis.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              border: `1px solid ${theme.colors.g20}`,
              padding: "10px 14px",
              color: theme.colors.g76,
              fontFamily: "monospace",
              fontSize: "14px",
              letterSpacing: "0.08em",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                display: "flex",
                background: theme.colors.axis[axis.key],
              }}
            />
            {LABELS[index]}
          </div>
        ))}
      </div>
    </div>
  );
}
