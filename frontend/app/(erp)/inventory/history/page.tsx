import type { Metadata } from "next";
import { HistoryView } from "@/components/modules/inventory/InventoryViews";

export const metadata: Metadata = { title: "Stock history" };

export default function Page() {
  return <HistoryView />;
}
