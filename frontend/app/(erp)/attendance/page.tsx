import type { Metadata } from "next";
import { AttendanceView } from "@/components/modules/workforce/WorkforceViews";

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return <AttendanceView />;
}
