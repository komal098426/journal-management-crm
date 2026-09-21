import type { Metadata } from "next";
import { OperationsView } from "@/components/modules/workforce/WorkforceViews";

export const metadata: Metadata = { title: "Operations" };

export default function Page() {
  return <OperationsView />;
}
