import type { Metadata } from "next";
import type { Verdict } from "@whichone/core";
import { Whichone } from "@/components/Whichone";
import { verdictFor, SAFE_QUERY, CHAINS } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ query: string }>; searchParams: Promise<{ chain?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const q = (await params).query; // Next 15 already decodes dynamic params
  const chain = (await searchParams).chain;
  const og = `/api/og?q=${encodeURIComponent(q)}${chain ? `&chain=${chain}` : ""}`;
  return {
    title: `Which ${q} is real?`,
    description: `Every token called ${q} across chains, ranked by who actually holds and trades it — Nansen labels, not market cap.`,
    openGraph: { title: `Which ${q} is real?`, images: [og] },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

/** Permalink: the verdict is computed server-side (cached 30 min) and rendered fully, so the share card and the page agree. */
export default async function Page({ params, searchParams }: Props) {
  const q = (await params).query; // Next 15 already decodes dynamic params
  const chainParam = (await searchParams).chain;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  if (!SAFE_QUERY.test(q)) return <Whichone initialQuery="" />;
  // a failed server-side verdict (no key, Nansen down) hands the query to the client, which streams it and shows the error banner
  let verdict: Verdict | undefined;
  try {
    verdict = (await verdictFor(q, chain)).verdict;
  } catch {
    verdict = undefined;
  }
  return <Whichone initialQuery={q} initialChain={chain ?? "all"} initialVerdict={verdict} />;
}
