import type { Metadata } from "next";
import RequestPage from "@/components/RequestPage";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Request removal", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <RequestPage type="removal" slug={(await params).slug} />;
}
