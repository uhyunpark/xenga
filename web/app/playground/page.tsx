import type { Metadata } from "next";
import { PlaygroundHub } from "@/components/playground/PlaygroundHub";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Try Xenga's escrow protocol hands-on — agent service automation or human marketplace checkout on Base Sepolia.",
};

export default function PlaygroundPage() {
  return <PlaygroundHub />;
}
