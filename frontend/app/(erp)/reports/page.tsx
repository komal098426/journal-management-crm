import type { Metadata } from "next";
import { ReportsView } from "@/components/modules/finance/FinanceViews";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default function Page() {
  return <ReportsView />;
}
