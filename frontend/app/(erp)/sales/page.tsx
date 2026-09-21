import type { Metadata } from "next";
import { InvoiceList } from "@/components/modules/invoices/InvoiceList";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return <InvoiceList kind="sale" />;
}
