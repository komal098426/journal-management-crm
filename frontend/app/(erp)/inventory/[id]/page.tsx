import type { Metadata } from "next";
import { ProductDetailView } from "@/components/modules/inventory/InventoryViews";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Product" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = await idFromParams(params);
  return <ProductDetailView id={id} />;
}
