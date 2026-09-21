import type { Metadata } from "next";
import { InvoicePrint } from "@/components/modules/invoices/InvoicePrint";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return <InvoicePrint id={await idFromParams(params)} />;
}
