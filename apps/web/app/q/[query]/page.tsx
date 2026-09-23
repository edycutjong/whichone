import type { Metadata } from "next";
import type { Verdict } from "@whichone/core";
import { Whichone } from "@/components/Whichone";
import { SiteHeader, SiteFooter } from "@/components/Shell";
import { headers } from "next/headers";
import { SAFE_QUERY, CHAINS } from "@/lib/engine";
import { permalinkVerdict } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ query: string }>; searchParams: Promise<{ chain?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const q = (await params).query; // Next 15 already decodes dynamic params
  const chainParam = (await searchParams).chain;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  const og = `/api/og?q=${encodeURIComponent(q)}${chain ? `&chain=${chain}` : ""}`;
  return {
    title: `Which ${q} is real?`,
    description: `Every token called ${q} across chains, ranked by who actually holds and trades it — Nansen labels, not market cap.`,
    openGraph: { title: `Which ${q} is real?`, images: [og] },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

/**
 * Permalink: the verdict is computed server-side (cached 30 min) and rendered fully, so the share card and the page agree.
 * It runs under the route's spend guard (lib/guard.ts); past a ceiling the client stream takes over and says why.
 */
export default async function Page({ params, searchParams }: Props) {
  const q = (await params).query; // Next 15 already decodes dynamic params
  const chainParam = (await searchParams).chain;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  if (!SAFE_QUERY.test(q))
    return (
      <div className="with-rail">
        <SiteHeader current="home" />
        <Whichone initialQuery="" />
        <SiteFooter />
      </div>
    );
  // a failed or guarded server-side verdict (no key, Nansen down, rate or budget ceiling) hands the query to the client,
  // which streams it through /api/verdict and shows that route's answer
  let verdict: Verdict | undefined;
  try {
    verdict = await permalinkVerdict(q, chain, await headers());
  } catch {
    verdict = undefined;
  }
  return (
    <div className="with-rail">
      <SiteHeader current="home" />
      <Whichone initialQuery={q} initialChain={chain ?? "all"} initialVerdict={verdict} />
      <SiteFooter />
    </div>
  );
}
