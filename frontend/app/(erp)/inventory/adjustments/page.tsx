import type { Metadata } from "next";
import { AdjustmentsView } from "@/components/modules/inventory/InventoryViews";

export const metadata: Metadata = { title: "Stock adjustments" };

export default function Page() {
  return <AdjustmentsView />;
}
