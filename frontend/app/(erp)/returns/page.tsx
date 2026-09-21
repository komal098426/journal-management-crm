import type { Metadata } from "next";
import { ReturnsView } from "@/components/modules/finance/FinanceViews";

export const metadata: Metadata = { title: "Returns" };

export default function Page() {
  return <ReturnsView />;
}
