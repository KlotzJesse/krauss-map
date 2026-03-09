import type { Metadata } from "next";

import { PostalCodesOverview } from "@/components/postal-codes/postal-codes-overview";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "KRAUSS Gebietsmanagement - PLZ",
    description: "Interaktives Gebietsmanagement für deutsche Postleitzahlen",
    openGraph: {
      title: "KRAUSS Gebietsmanagement - PLZ",
      description: "Interaktives Gebietsmanagement für deutsche Postleitzahlen",
      type: "website",
    },
  };
}

export default async function PostalCodesPage() {
  return <PostalCodesOverview />;
}
