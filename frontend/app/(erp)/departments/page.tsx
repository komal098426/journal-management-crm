import type { Metadata } from "next";
import { DepartmentsView } from "@/components/modules/workforce/WorkforceViews";

export const metadata: Metadata = { title: "Departments" };

export default function Page() {
  return <DepartmentsView />;
}
