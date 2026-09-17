import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://whichone.edycu.dev"),
  title: "Which One's Real — fourteen tokens share the name, Nansen labels decide which",
  description: "Type a ticker. Every same-name token across chains, ranked by who actually holds and trades it. One turns green.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Which One's Real",
    title: "Which One's Real",
    description: "Type a ticker. One card turns green.",
    images: [
      {
        url: "/api/og?q=PEPE",
        width: 1200,
        height: 630,
        alt: "Which One's Real share card: 1 of 15 PEPE is real — the green winner and two greyed same-name tokens, ranked by Nansen labels",
      },
    ],
  },
  twitter: { card: "summary_large_image", creator: "@edycutjong", title: "Which One's Real", description: "Type a ticker. One card turns green." },
  authors: [{ name: "Edy Cu Tjong", url: "https://github.com/edycutjong" }],
  creator: "Edy Cu Tjong",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0a0e13", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
