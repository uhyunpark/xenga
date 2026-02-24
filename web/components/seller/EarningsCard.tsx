"use client";

interface OrderData {
  id: string;
  price: string;
  priceUsdc: number;
  status: string;
}

export function EarningsCard({ orders }: { orders: OrderData[] }) {
  const completedStatuses = ["completed", "delivery_confirmed"];
  const activeStatuses = ["escrowed"];

  const completedTotal = orders
    .filter((o) => completedStatuses.includes(o.status))
    .reduce((sum, o) => sum + o.priceUsdc, 0);

  const activeTotal = orders
    .filter((o) => activeStatuses.includes(o.status))
    .reduce((sum, o) => sum + o.priceUsdc, 0);

  const totalVolume = orders.reduce((sum, o) => sum + o.priceUsdc, 0);

  return (
    <div className="panel-surface rounded-2xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
        Earnings
      </h3>
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-xs text-text-tertiary">Completed Earnings</p>
          <p className="text-2xl font-bold text-success">
            {completedTotal.toFixed(2)} <span className="text-sm font-normal text-text-tertiary">USDC</span>
          </p>
        </div>
        <div className="h-px bg-border-default" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-text-tertiary">In Escrow</p>
            <p className="text-lg font-semibold text-accent">
              {activeTotal.toFixed(2)} <span className="text-xs font-normal text-text-tertiary">USDC</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Total Volume</p>
            <p className="text-lg font-semibold">
              {totalVolume.toFixed(2)} <span className="text-xs font-normal text-text-tertiary">USDC</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
