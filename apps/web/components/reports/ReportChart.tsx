'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@ohmypos/ui/components/chart';

/**
 * Shared Recharts wrappers for Dashboard 3, themed from the CSS tokens. Row data
 * is a concrete record type so `xKey`/`yKey` stay plain strings.
 */
export type ChartRow = Record<string, string | number>;

const GRID_COLOR = 'var(--color-border-default)';
const AXIS_TEXT_COLOR = 'var(--color-text-tertiary)';

export const CHART_COLORS = [
  'var(--color-brand-primary)',
  'var(--color-accent-inflow)',
  'var(--color-brand-secondary)',
  'var(--color-accent-outflow)',
  'var(--color-brand-tertiary)',
];

const axisTickStyle = { fontSize: 12, fill: AXIS_TEXT_COLOR };

function compactNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

/** Shown in place of a chart when the report range has no rows (empty, not an error). */
export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-border-default text-sm text-text-tertiary">
      {message}
    </div>
  );
}

interface ReportBarChartSeries {
  key: string;
  label: string;
  color?: string;
}

interface ReportBarChartProps {
  data: ChartRow[];
  xKey: string;
  bars: ReportBarChartSeries[];
  height?: number;
  /** Y-axis tick label — stays short (e.g. "150 rb") so it never clips against the chart edge. */
  tickFormatter?: (value: number) => string;
  /** Tooltip value — full precision (e.g. "Rp 150.000"); defaults to tickFormatter. */
  tooltipFormatter?: (value: number) => string;
}

/** Categorical bar chart — P&L composition, top products, income share. */
export function ReportBarChart({
  data,
  xKey,
  bars,
  height = 280,
  tickFormatter = compactNumber,
  tooltipFormatter = tickFormatter,
}: ReportBarChartProps) {
  const chartConfig = Object.fromEntries(
    bars.map((bar, index) => [
      bar.key,
      {
        label: bar.label,
        color: bar.color ?? CHART_COLORS[index % CHART_COLORS.length],
      },
    ]),
  ) as ChartConfig;

  const barTooltipFormatter = (value: unknown, name: unknown) => (
    <span className="flex items-center gap-2">
      <span className="text-text-secondary">{String(name)}:</span>
      <span className="font-mono tabular-nums">
        {tooltipFormatter(Number(value ?? 0))}
      </span>
    </span>
  );

  return (
    <div style={{ height }} className="w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={axisTickStyle}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => tickFormatter(v)}
            width={64}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={barTooltipFormatter} />}
          />
          {bars.map((bar, index) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.label}
              fill={bar.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Dots for a one-point series, which would otherwise render as an empty panel (ERR-051). */
export function lineDotFor(pointCount: number): { r: number } | false {
  return pointCount === 1 ? { r: 3 } : false;
}

interface ReportLineChartSeries {
  key: string;
  label: string;
  color?: string;
}

interface ReportLineChartProps {
  data: ChartRow[];
  xKey: string;
  lines: ReportLineChartSeries[];
  height?: number;
  /** Y-axis tick label — stays short (e.g. "150 rb") so it never clips against the chart edge. */
  tickFormatter?: (value: number) => string;
  /** Tooltip value — full precision (e.g. "Rp 150.000"); defaults to tickFormatter. */
  tooltipFormatter?: (value: number) => string;
}

/** Trend line(s) sharing one x-axis. */
export function ReportLineChart({
  data,
  xKey,
  lines,
  height = 280,
  tickFormatter = compactNumber,
  tooltipFormatter = tickFormatter,
}: ReportLineChartProps) {
  const chartConfig = Object.fromEntries(
    lines.map((line, index) => [
      line.key,
      {
        label: line.label,
        color: line.color ?? CHART_COLORS[index % CHART_COLORS.length],
      },
    ]),
  ) as ChartConfig;

  const lineTooltipFormatter = (value: unknown, name: unknown) => (
    <span className="flex items-center gap-2">
      <span className="text-text-secondary">{String(name)}:</span>
      <span className="font-mono tabular-nums">
        {tooltipFormatter(Number(value ?? 0))}
      </span>
    </span>
  );

  return (
    <div style={{ height }} className="w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={axisTickStyle}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => tickFormatter(v)}
            width={64}
          />
          <ChartTooltip
            cursor={{ stroke: GRID_COLOR }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => (
                  <span className="font-semibold">{String(label)}</span>
                )}
                formatter={lineTooltipFormatter}
              />
            }
          />
          {lines.map((line, index) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.label}
              stroke={line.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={lineDotFor(data.length)}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

export interface PieChartItem {
  name: string;
  value: number;
  percentage: number;
  color?: string;
}

interface ReportPieChartProps {
  data: PieChartItem[];
  height?: number;
  valueFormatter?: (value: number) => string;
}

/** Donut / Pie chart for distribution metrics with percentage share */
export function ReportPieChart({
  data,
  height = 260,
  valueFormatter = compactNumber,
}: ReportPieChartProps) {
  const chartConfig = Object.fromEntries(
    data.map((item, index) => [
      item.name,
      {
        label: item.name,
        color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
      },
    ]),
  ) as ChartConfig;

  const pieTooltipFormatter = (value: unknown, name: unknown) => {
    const item = data.find((d) => d.name === name);
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">{String(name)}:</span>
          <span className="font-mono tabular-nums font-semibold">
            {valueFormatter(Number(value ?? 0))}
          </span>
        </div>
        {item && (
          <span className="text-xs text-text-tertiary">
            Porsi: {item.percentage.toFixed(1)}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent formatter={pieTooltipFormatter} />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.color ?? CHART_COLORS[index % CHART_COLORS.length]
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
