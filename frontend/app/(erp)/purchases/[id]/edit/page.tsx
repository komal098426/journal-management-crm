import type { Metadata } from "next";
import { InvoiceEditLoader } from "@/components/modules/invoices/InvoiceDetail";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Edit purchase" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  return <InvoiceEditLoader kind="purchase" id={await idFromParams(params)} />;
}
