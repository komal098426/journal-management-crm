import type { Metadata } from "next";
import { InvoiceForm } from "@/components/modules/invoices/InvoiceForm";

export const metadata: Metadata = { title: "New purchase" };

export default function NewPurchasePage() {
  return <InvoiceForm kind="purchase" />;
}
