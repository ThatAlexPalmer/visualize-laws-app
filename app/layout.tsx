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
  title: "visualizelaws.app",
  description:
    "Explore the complete LOCUS-v1 corpus of ~2.2M U.S. local laws: search, filter, and an interactive map.",
  applicationName: "visualizelaws.app",
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
