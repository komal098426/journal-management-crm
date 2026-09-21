import type { Metadata } from "next";
import { CategoriesView } from "@/components/modules/inventory/InventoryViews";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return <CategoriesView />;
}
