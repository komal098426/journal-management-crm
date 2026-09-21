import type { Metadata } from "next";
import { PaymentsView } from "@/components/modules/finance/FinanceViews";

export const metadata: Metadata = { title: "Finance" };

export default function Page() {
  return <PaymentsView />;
}
