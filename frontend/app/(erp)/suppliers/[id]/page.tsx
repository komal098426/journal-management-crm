import type { Metadata } from "next";
import { PartyDetailView } from "@/components/modules/parties/PartyViews";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Supplier" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = await idFromParams(params);
  return <PartyDetailView kind="supplier" id={id} />;
}
