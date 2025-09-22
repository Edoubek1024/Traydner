import { useEffect } from "react";

type Props = {
  open: boolean;
  action: "buy" | "sell";
  symbol: string;
  quantity: number;
  price?: number;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmTradeModal({
  open,
  action,
  symbol,
  quantity,
  price,
  confirming,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  const total =
    price != null && Number.isFinite(price) && quantity > 0
      ? price * quantity
      : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-[90%] max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <h3 className="mb-3 text-xl font-semibold text-white">Confirm order</h3>

        <p className="mb-4 text-sm text-gray-300">
          You&apos;re about to{" "}
          <span className={action === "buy" ? "text-emerald-400" : "text-red-400"}>
            {action}
          </span>{" "}
          <strong>{quantity}</strong> {symbol}
          {price != null && Number.isFinite(price) && (
            <>
              {" "}
              at <strong>${price.toLocaleString(undefined, { maximumFractionDigits: 8 })}</strong>
            </>
          )}
          .
        </p>

        <div className="mb-5 grid grid-cols-2 gap-2 text-sm text-gray-300">
          <span className="text-gray-400">Action</span>
          <span className={action === "buy" ? "text-emerald-400" : "text-red-400"}>
            {action.toUpperCase()}
          </span>
          <span className="text-gray-400">Symbol</span>
          <span>{symbol}</span>
          <span className="text-gray-400">Quantity</span>
          <span>{quantity}</span>
          <span className="text-gray-400">Price</span>
          <span>{price != null ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 8 })}` : "N/A"}</span>
          <span className="text-gray-400">Estimated total</span>
          <span>{total != null ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "N/A"}</span>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-600 px-4 py-2 text-gray-200 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-60 ${
              action === "buy"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {confirming ? "Placing…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
