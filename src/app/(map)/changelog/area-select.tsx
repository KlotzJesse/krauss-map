"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

interface AreaSelectProps {
  areas: { id: number; name: string }[];
  currentArea?: string;
  currentType?: string;
}

export function AreaSelect({
  areas,
  currentArea,
  currentType,
}: AreaSelectProps) {
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = new URLSearchParams();
    if (currentType) p.set("type", currentType);
    if (e.target.value) p.set("area", e.target.value);
    const qs = p.toString();
    router.push(`/changelog${qs ? `?${qs}` : ""}` as Route);
  };

  return (
    <select
      name="area"
      className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
      defaultValue={currentArea ?? ""}
      onChange={handleChange}
    >
      <option value="">Alle Gebiete</option>
      {areas.map((a) => (
        <option key={a.id} value={String(a.id)}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
