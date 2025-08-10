// components/Charts/CryptoChart.tsx
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CategoryScale,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { ChartOptions, ChartData, Plugin } from "chart.js";
// If you already have a crypto candle type, import it instead:
export interface CryptoCandle {
  timestamp: number; // seconds since epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
import "chartjs-adapter-date-fns";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CategoryScale
);

const crosshairPlugin: Plugin<"line"> = {
  id: "crosshair",
  afterDraw: (chart) => {
    if (chart.tooltip?.active && chart.tooltip.dataPoints?.length) {
      const ctx = chart.ctx;
      const activePoint = chart.tooltip.dataPoints[0];
      const x = activePoint.element.x;
      const y = activePoint.element.y;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;
      const leftX = chart.scales.x.left;
      const rightX = chart.scales.x.right;

      ctx.save();

      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.stroke();

      ctx.restore();
    }
  },
};

interface CryptoChartProps {
  symbol: string;
  price: number | undefined;
  candles: CryptoCandle[];
  decimals?: number;
}

export default function CryptoChart({
  symbol,
  price,
  candles,
  decimals = 2,
}: CryptoChartProps) {
  const data: ChartData<"line"> = {
    labels: candles.map((c) =>
      new Date(c.timestamp * 1000)
        .toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .replace(",", "")
    ),
    datasets: [
      {
        label: `${symbol} (Close Price)`,
        data: candles.map((c) => c.close),
        borderColor: "#e0d700", // "#06b6d4"
        backgroundColor: "rgba(240, 215, 0, 0.2)", // 6,182,212,0.2
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "#e0d700",
        pointHoverBorderColor: "#ffffff",
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: "index",
        intersect: false,
        position: "nearest",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "white",
        bodyColor: "white",
        borderColor: "#e0d700",
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          title: (items) => (items?.[0]?.label ?? ""),
          label: (ctx) =>
            `$${ctx.parsed.y.toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}`,
        },
      },
    },
    scales: {
      x: {
        type: "category",
        title: { display: true, text: "Time", color: "#fff" },
        ticks: {
          color: "#dfdfdf",
          maxRotation: 45,
          minRotation: 20,
          autoSkip: true,
          maxTicksLimit: 20,
        },
      },
      y: {
        title: { display: true, text: "Price (USDT)", color: "#fff" },
        ticks: { color: "#dfdfdf" },
      },
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor =
          elements.length > 0 ? "crosshair" : "default";
      }
    },
  };

  return (
    <div className="mb-10">
      <h3 className="text-xl font-semibold mb-2 text-white">
        {symbol}:{" "}
        {price != null
          ? `$${price.toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}`
          : "N/A"}
      </h3>
      <div className="bg-gray-700 rounded-lg shadow p-4">
        <Line data={data} options={options} plugins={[crosshairPlugin]} />
      </div>
    </div>
  );
}
