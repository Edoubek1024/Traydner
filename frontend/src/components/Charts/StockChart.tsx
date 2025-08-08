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
import { StockCandle } from "../../api/stocks";
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
  id: 'crosshair',
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
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.stroke();
      
      ctx.restore();
    }
  }
};

interface StockChartProps {
  symbol: string;
  price: number | undefined;
  candles: StockCandle[];
}

export default function StockChart({ symbol, price, candles }: StockChartProps) {
  const data: ChartData<"line"> = {
    labels: candles.map(c =>
      new Date(c.timestamp * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).replace(",", "")
    ),
    datasets: [
      {
        label: `${symbol} (Close Price)`,
        data: candles.map((c) => c.close),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34,197,94,0.2)",
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "#22c55e",
        pointHoverBorderColor: "#ffffff",
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        position: 'nearest',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: '#22c55e',
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          title: (context) => {
            context[0].label
          },
          label: (context) => {
            return `$${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: "category",
        title: {
          display: true,
          text: "Time",
        },
        ticks: {
          maxRotation: 45,
          minRotation: 20,
          autoSkip: true,
          maxTicksLimit: 20,
        },
      },
      y: {
        title: {
          display: true,
          text: "Price (USD)",
        },
      },
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = elements.length > 0 ? 'crosshair' : 'default';
      }
    }
  };

  return (
    <div className="mb-10">
      <h3 className="text-xl font-semibold mb-2">
        {symbol}: ${price?.toFixed(2) ?? "N/A"}
      </h3>
      <div className="bg-white rounded-lg shadow p-4">
        <Line 
          data={data} 
          options={options} 
          plugins={[crosshairPlugin]}
        />
      </div>
    </div>
  );
}