import type { Metadata } from "next";
import { PeopleView } from "@/components/modules/workforce/WorkforceViews";

export const metadata: Metadata = { title: "People" };

export default function Page() {
  return <PeopleView />;
}
