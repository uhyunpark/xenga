"use client";

import { use } from "react";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { PaymentLinkCheckout } from "@/components/payment-links/PaymentLinkCheckout";

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <WalletProvider mode="demo">
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <PaymentLinkCheckout linkId={id} />
      </div>
    </WalletProvider>
  );
}
