import type { Metadata } from "next";
import { InvoiceList } from "@/components/modules/invoices/InvoiceList";

export const metadata: Metadata = { title: "Procurement" };

export default function PurchasesPage() {
  return <InvoiceList kind="purchase" />;
}
