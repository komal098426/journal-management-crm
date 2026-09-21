import type { Metadata } from "next";
import { TasksView } from "@/components/modules/workforce/WorkforceViews";

export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return <TasksView />;
}
