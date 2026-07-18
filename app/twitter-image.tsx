import { ImageResponse } from "next/og";
import { SocialCard } from "./social-card";

export const alt = "Visualize Laws — The fine print has a map now.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<SocialCard />, size);
}
