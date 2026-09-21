import type { Metadata } from "next";
import { SettingsView } from "@/components/modules/settings/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsView />;
}
