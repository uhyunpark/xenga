import type { Metadata } from "next";
import SellerPage from "./SellerPage";

export const metadata: Metadata = {
  title: "Seller Dashboard — Xenga",
  description:
    "Manage your orders, confirm deliveries, view earnings, and monitor your on-chain reputation score.",
};

export default function Page() {
  return <SellerPage />;
}
