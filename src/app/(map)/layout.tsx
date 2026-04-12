import { AppSidebar } from "@/components/app-sidebar";

import { MapLayoutShell } from "./map-layout-shell";

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MapLayoutShell sidebar={<AppSidebar variant="inset" />}>
      {children}
    </MapLayoutShell>
  );
}
