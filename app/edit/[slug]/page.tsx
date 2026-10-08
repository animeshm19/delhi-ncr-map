import type { Metadata } from "next";
import RequestPage from "@/components/RequestPage";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Suggest an edit", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <RequestPage type="edit" slug={(await params).slug} />;
}
