import type { Metadata } from "next";
import { InvoiceEditLoader } from "@/components/modules/invoices/InvoiceDetail";
import { idFromParams } from "@/lib/params";

export const metadata: Metadata = { title: "Edit sale" };

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  return <InvoiceEditLoader kind="sale" id={await idFromParams(params)} />;
}
