"use client";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export function Footer() {
  const isMockChain = process.env.NEXT_PUBLIC_MOCK_CHAIN === "true";
  const envLabel = isMockChain ? "Mock Chain (Simulated)" : "Base Sepolia Testnet";
  const envBadgeClass = isMockChain
    ? "border-accent-purple/35 bg-accent-purple/10 text-accent-purple"
    : "border-warning/30 bg-warning/10 text-warning";

  return (
    <footer className="border-t border-border-default px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <span className="text-accent">x402</span>
              <span className="text-text-secondary">Escrow</span>
            </div>
            <p className="text-sm text-text-tertiary">
              {isMockChain
                ? "Agentic payments with simulated escrow state for offline demos."
                : "Agentic payments with on-chain escrow protection."}
            </p>
            <div className="mt-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${envBadgeClass}`}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isMockChain ? "bg-accent-purple" : "bg-warning"
                  }`}
                />
                {envLabel}
              </span>
            </div>
          </div>

          {/* Contracts */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-text-primary">
              {isMockChain ? "Simulation" : "Contracts"}
            </h4>
            <div className="space-y-2">
              {isMockChain ? (
                <>
                  <p className="text-xs text-text-tertiary">
                    Mock mode uses an in-memory escrow store and generated tx hashes.
                  </p>
                  <p className="text-xs text-text-tertiary">
                    No live contract interactions are broadcast.
                  </p>
                </>
              ) : (
                <>
                  <ContractLink
                    label="USDC"
                    address={USDC_ADDRESS}
                  />
                  <p className="text-xs text-text-tertiary">
                    EscrowVault address shown in Health endpoint
                  </p>
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-text-primary">
              Resources
            </h4>
            <div className="space-y-2">
              {isMockChain ? (
                <>
                  <p className="text-sm text-text-secondary">
                    External chain links are hidden in simulation mode.
                  </p>
                </>
              ) : (
                <>
                  <a
                    href="https://sepolia.basescan.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-text-secondary transition-colors hover:text-text-primary"
                  >
                    BaseScan (Sepolia)
                  </a>
                  <a
                    href="https://www.circle.com/en/multi-chain-usdc/base"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-text-secondary transition-colors hover:text-text-primary"
                  >
                    USDC on Base
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border-default pt-6 text-center text-xs text-text-tertiary">
          {isMockChain
            ? "x402 Escrow Protocol · Mock Chain Mode · Events and tx hashes are simulated"
            : "x402 Escrow Protocol · Built on Base Sepolia · All transactions use testnet USDC"}
        </div>
      </div>
    </footer>
  );
}

function ContractLink({
  label,
  address,
}: {
  label: string;
  address: string;
}) {
  return (
    <div>
      <span className="text-xs text-text-tertiary">{label}: </span>
      <a
        href={`https://sepolia.basescan.org/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-text-secondary transition-colors hover:text-accent"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </a>
    </div>
  );
}
