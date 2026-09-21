import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsView } from "@/components/modules/inventory/InventoryViews";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return <Suspense><ProductsView /></Suspense>;
}
