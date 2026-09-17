import { Whichone } from "@/components/Whichone";
import { SiteHeader, SiteFooter } from "@/components/Shell";
import type { Verdict } from "@whichone/core";
import pepe from "../../../fixtures/PEPE.json";

export const dynamic = "force-dynamic";

/** The recorded PEPE verdict (fixtures/PEPE.json) is the empty state's example — replayed, 0 credits, labelled. */
const EXAMPLE = (pepe as { verdict: Verdict }).verdict;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; chain?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <SiteHeader current="home" />
      <Whichone initialQuery={sp.q} initialChain={sp.chain} example={EXAMPLE} />
      <SiteFooter />
    </>
  );
}
