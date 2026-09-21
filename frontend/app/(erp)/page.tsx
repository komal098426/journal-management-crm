import type { Metadata } from "next";
import { DashboardView } from "@/components/modules/dashboard/DashboardView";

export const metadata: Metadata = { title: "ERP Overview" };

export default function OverviewPage() {
  return <DashboardView />;
}
