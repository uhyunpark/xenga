import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: "Docs — Xenga",
  description:
    "Documentation for the Xenga escrow protocol — quickstart, SDK reference, API docs, and guides.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <DocsSidebar />
      <main className="flex-1 overflow-auto">
        <article className="mx-auto max-w-4xl p-4 md:p-8">{children}</article>
      </main>
    </div>
  );
}
