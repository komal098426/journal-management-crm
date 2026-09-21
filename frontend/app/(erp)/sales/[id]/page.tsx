import type { Metadata } from "next";
import { InvoiceDetail } from "@/components/modules/invoices/InvoiceDetail";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Sale details" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <InvoiceDetail kind="sale" id={await idFromParams(params)} />;
}
