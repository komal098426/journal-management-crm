import type { Metadata } from "next";
import { PartyList } from "@/components/modules/parties/PartyViews";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <PartyList kind="customer" />;
}
