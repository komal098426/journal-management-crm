import type { Metadata } from "next";
import { PartyList } from "@/components/modules/parties/PartyViews";

export const metadata: Metadata = { title: "Suppliers" };

export default function Page() {
  return <PartyList kind="supplier" />;
}
