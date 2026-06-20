import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import StyledComponentsRegistry from "@/lib/registry";
import { AppProviders } from "@/lib/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LOCUS Explorer",
  description:
    "Explore the complete LOCUS-v1 corpus of ~2.2M U.S. local laws: search, filter, and an interactive map.",
  applicationName: "LOCUS Explorer",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <StyledComponentsRegistry>
          <AppProviders>{children}</AppProviders>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
