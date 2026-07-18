import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import StyledComponentsRegistry from "@/lib/registry";
import { AppProviders } from "@/lib/theme-provider";
import { AppFrame } from "@/components/layout/AppFrame";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://visualizelaws.com"),
  title: "visualizelaws.com",
  description:
    "Explore the complete LOCUS-v1 corpus of ~2.2M U.S. local laws: search, filter, and an interactive map.",
  applicationName: "visualizelaws.com",
  alternates: { canonical: "/" },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Visualize Laws",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "visualizelaws.com",
    title: "The fine print has a map now.",
    description: "Search and map 2.2 million U.S. local laws.",
  },
  twitter: {
    card: "summary_large_image",
    title: "The fine print has a map now.",
    description: "Search and map 2.2 million U.S. local laws.",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <StyledComponentsRegistry>
          <AppProviders>
            <AppFrame>{children}</AppFrame>
          </AppProviders>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
