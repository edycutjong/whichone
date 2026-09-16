import { Whichone } from "@/components/Whichone";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; chain?: string }> }) {
  const sp = await searchParams;
  return <Whichone initialQuery={sp.q} initialChain={sp.chain} />;
}
