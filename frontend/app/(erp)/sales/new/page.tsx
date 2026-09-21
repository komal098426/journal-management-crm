import type { Metadata } from "next";
import { InvoiceForm } from "@/components/modules/invoices/InvoiceForm";

export const metadata: Metadata = { title: "New sale" };

export default function NewSalePage() {
  return <InvoiceForm kind="sale" />;
}
