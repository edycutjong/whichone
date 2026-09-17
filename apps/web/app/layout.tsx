import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://whichone.edycu.dev"),
  title: "Which One's Real — fourteen tokens share the name, Nansen labels decide which",
  description: "Type a ticker. Every same-name token across chains, ranked by who actually holds and trades it. One turns green.",
  openGraph: { title: "Which One's Real", description: "Type a ticker. One card turns green.", images: ["/api/og?q=PEPE"] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
