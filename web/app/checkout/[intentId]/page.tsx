import type { Metadata } from "next";
import { CheckoutPage } from "./CheckoutPage";

export const metadata: Metadata = {
  title: "Checkout — Xenga",
  description: "Complete your escrow payment securely via x402 protocol.",
};

export default function Page({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  return <CheckoutPage paramsPromise={params} />;
}
