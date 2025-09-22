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
import "chartjs-adapter-date-fns";

// Minimal candle shape both of your sources satisfy
export type Candle = {
  timestamp: number; // seconds since epoch
  close: number;
  // (open/high/low/volume can exist, but we don't require them)
};

// Register once
ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CategoryScale
);

// Shared crosshair
const crosshairPlugin: Plugin<"line"> = {
  id: "crosshair",
  afterDraw: (chart) => {
    if (chart.tooltip?.active && chart.tooltip.dataPoints?.length) {
      const ctx = chart.ctx;
      const pt = chart.tooltip.dataPoints[0];
      const x = pt.element.x;
      const y = pt.element.y;
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

// Pulse animation plugin
const pulsePlugin: Plugin<"line"> = {
  id: "pulse",
  afterDraw: (chart) => {
    const ctx = chart.ctx;
    const dataset = chart.data.datasets[0];
    
    if (!dataset?.data || dataset.data.length === 0) return;
    
    const lastIndex = dataset.data.length - 1;
    const meta = chart.getDatasetMeta(0);
    const lastPoint = meta.data[lastIndex];
    
    if (!lastPoint) return;
    
    const x = lastPoint.x;
    const y = lastPoint.y;
    const currentTime = Date.now();
    const color = dataset.borderColor as string || "#22c55e";
    
    const pulses = [
      { phase: 0, maxRadius: 20, duration: 4200 },
      { phase: 0.5, maxRadius: 20, duration: 4200 },
    ];
    
    ctx.save();
    
    pulses.forEach((pulse) => {
      // Calculate animation progress (0 to 1)
      const progress = ((currentTime + pulse.phase * pulse.duration) % pulse.duration) / pulse.duration;
      
      // Ease out animation
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      // Calculate radius and opacity
      const radius = pulse.maxRadius * easedProgress;
      const opacity = Math.max(0, 1 - easedProgress);
      
      if (opacity > 0) {
        // Parse color to get RGB values
        let r, g, b;
        if (color.startsWith('#')) {
          const hex = color.slice(1);
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        } else {
          // Default to green if can't parse
          r = 34; g = 197; b = 94;
        }
        
        // Draw the pulse circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.8})`;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.2})`;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    });
    
    // Draw the center dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
    
    // Request animation frame to keep the animation running
    setTimeout(() => {
      chart.update('none');
    }, 120);
  },
};

type AssetLineChartProps = {
  symbol: string;
  price?: number;
  candles: Candle[];
  color?: string;
  fill?: string;
  yLabel?: string;
  decimals?: number;
  hideHeader?: boolean;
  className?: string;
  marketOpen?: boolean;
};

export default function HistoryChart({
  symbol,
  price,
  candles,
  color = "#22c55e", // green (stock default)
  fill = "rgba(34,197,94,0.2)",
  yLabel = "Price (USD)",
  decimals = 2,
  hideHeader = false,
  className = "",
  marketOpen = true,
}: AssetLineChartProps) {
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const labels = candles.map((c) =>
    new Date(c.timestamp * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: userTZ,
    }).replace(",", "")
  );

  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        label: `${symbol} (Close Price)`,
        data: candles.map((c) => c.close),
        borderColor: color,
        backgroundColor: fill,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: marketOpen ? 0 : 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: "#ffffff",
        pointHoverBorderWidth: 2,
        fill: true,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: "index",
        intersect: false,
        position: "nearest",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "white",
        bodyColor: "white",
        borderColor: color,
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          title: (items) => {
            if (!items?.length) return "";
            const ts = candles[items[0].dataIndex]?.timestamp;
            if (!ts) return "";
            return new Date(ts * 1000).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: userTZ,
            });
          },
          label: (ctx) => `$${ctx.parsed.y.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}`,
        },
      },
    },
    scales: {
      x: {
        type: "category",
        title: { display: true, text: "Time", color: "#d1d5db" },
        ticks: {
          color: "#d1d5db",
          maxRotation: 45,
          minRotation: 20,
          autoSkip: true,
          maxTicksLimit: 20,
        },
        grid: {
          color: "#444",
        },
      },
      y: {
        title: { display: true, text: yLabel, color: "#d1d5db" },
        ticks: { 
          color: "#d1d5db",
          callback: function(value) {
            return `$${Number(value).toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}`;
          }
        },
        grid: {
          color: "#444",
        },
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
    <div className={`w-full ${className}`}>
      {!hideHeader && (
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-200">
              {symbol}
            </h3>
            <p className="text-3xl font-semibold" style={{ color }}>
              {price != null
                ? `$${price.toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                  })}`
                : "N/A"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-200">
            {marketOpen ? (
              <>
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: color }}
                ></div>
                Live
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                Market Closed
              </>
            )}
          </div>
        </div>
      )}
      <div className="bg-card border border-gray-400 rounded-lg shadow-lg p-6 h-[32rem]">
        <Line
          data={data}
          options={options}
          plugins={[crosshairPlugin, ...(marketOpen ? [pulsePlugin] : [])]}
        />
      </div>
    </div>
  );
}