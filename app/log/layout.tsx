import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Release log · visualizelaws.com",
  description: "What you can do in each version of Visualize Laws.",
  alternates: { canonical: "/log" },
};

export default function LogLayout({ children }: { children: ReactNode }) {
  return children;
}
