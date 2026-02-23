"use client";

import { useMemo, useState, useCallback } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { UsdcAmount } from "@/components/ui/UsdcAmount";

export function SignatureTab() {
  const { events } = useInspector();

  const signEvents = useMemo(
    () => events.filter((e) => e.type === "eip712_sign"),
    [events]
  );

  const sigResults = useMemo(
    () => events.filter((e) => e.type === "signature_result"),
    [events]
  );

  const latestSign = signEvents[signEvents.length - 1];
  const latestResult = sigResults[sigResults.length - 1];

  if (!latestSign) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No signing events yet. A signature is created when you authorize a payment.
      </div>
    );
  }

  const { domain, message } = latestSign.data;

  return (
    <div className="max-h-full space-y-4 overflow-y-auto p-1 animate-inspector-flash">
      {/* EIP-712 Domain */}
      <section>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
          EIP-712 Domain
        </h3>
        <JsonViewer data={domain} />
      </section>

      {/* ReceiveWithAuthorization Fields */}
      {message && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
            ReceiveWithAuthorization
          </h3>
          <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border-default">
                <FieldRow label="from">
                  <AddressDisplay address={message.from} />
                </FieldRow>
                <FieldRow label="to">
                  <AddressDisplay address={message.to} />
                </FieldRow>
                <FieldRow label="value">
                  <UsdcAmount amount={message.value} />
                </FieldRow>
                <FieldRow label="validAfter">
                  <span className="font-mono text-text-secondary">{String(message.validAfter)}</span>
                </FieldRow>
                <FieldRow label="validBefore">
                  <span className="font-mono text-text-secondary">{String(message.validBefore)}</span>
                </FieldRow>
                <FieldRow label="nonce">
                  <span className="font-mono text-text-secondary text-xs break-all">{message.nonce}</span>
                </FieldRow>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Resulting Signature */}
      {latestResult && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
            Signature Components
          </h3>
          <div className="space-y-2">
            <SigField label="v" value={String(latestResult.data.v)} />
            <SigField label="r" value={latestResult.data.r} />
            <SigField label="s" value={latestResult.data.s} />
          </div>
        </section>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="px-3 py-2 text-text-tertiary font-mono text-xs w-28">{label}</td>
      <td className="px-3 py-2">{children}</td>
    </tr>
  );
}

function SigField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 py-2">
      <span className="text-xs font-semibold text-accent-purple w-4 shrink-0">{label}</span>
      <span className="font-mono text-xs text-text-secondary break-all flex-1">{value}</span>
      <button
        onClick={handleCopy}
        className="shrink-0 text-xs text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
