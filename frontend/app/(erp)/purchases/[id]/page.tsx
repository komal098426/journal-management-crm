import type { Metadata } from "next";
import { InvoiceDetail } from "@/components/modules/invoices/InvoiceDetail";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Purchase details" };

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <InvoiceDetail kind="purchase" id={await idFromParams(params)} />;
}
