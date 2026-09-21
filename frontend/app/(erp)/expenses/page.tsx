import type { Metadata } from "next";
import { ExpensesView } from "@/components/modules/finance/FinanceViews";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return <ExpensesView />;
}
