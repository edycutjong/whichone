import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Which One's Real — nothing here",
  description: "That address is not one of ours. The tool lives at /, the judge page at /judge, and every verdict has a permalink at /q/<ticker>.",
  robots: { index: false, follow: true },
};

/** 404 — same shell as the home, the three places that do exist, and the shape of a permalink. Returns HTTP 404. */
export default function NotFound() {
  return (
    <>
      <SiteHeader current="home" />
      <main className="wrap judge">
        <p className="judge-kicker">404 · not found</p>
        <h1>
          Nothing <span className="real">real</span> here.
        </h1>
        <p className="judge-lede">
          That path is not one of ours. This site has three kinds of page: the tool at <code>/</code>, where you type a ticker; the judge page at{" "}
          <code>/judge</code>, with the receipts and the reproduce command; and one permalink per verdict, shaped <code>/q/PEPE</code> — the ticker, not a
          contract address.
        </p>
        <p className="actions">
          <Link href="/" className="btn primary">
            Check a ticker
          </Link>
          <Link href="/judge" className="btn">
            For the judge
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
