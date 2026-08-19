'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
 * OhMyPos — shared Recharts theme for Dashboard 3 (DESIGN.md §36/§37: "Charts
 * should be analytical, not decorative" and the Flow Indicator's "visual
 * treatment must remain consistent across screens"). One wrapper per chart
 * shape (bar / line) so every report view themes identically instead of each
 * view hand-rolling its own axis/tooltip/grid styling.
 *
 * Colors are read as CSS custom properties (packages/ui/src/styles/globals.css
 * `@theme` tokens) — Recharts accepts any valid CSS color string for
 * fill/stroke, so these stay in sync with the rest of the design system
 * without hardcoding hex values here.
 *
 * Chart row data is typed as a plain string/number record rather than a
 * caller-supplied generic — Recharts 3's `dataKey` typing (`TypedDataKey`) is
 * a conditional type that can't resolve against an unbound generic type
 * parameter, so keeping the row shape concrete here is what lets `xKey`/`yKey`
 * stay plain `string` instead of needing an `as` cast at every call site.
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
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.label}
              fill={`var(--color-${bar.key})`}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

interface ReportLineChartProps {
  data: ChartRow[];
  xKey: string;
  yKey: string;
  label: string;
  color?: string;
  height?: number;
  /** Y-axis tick label — stays short (e.g. "150 rb") so it never clips against the chart edge. */
  tickFormatter?: (value: number) => string;
  /** Tooltip value — full precision (e.g. "Rp 150.000"); defaults to tickFormatter. */
  tooltipFormatter?: (value: number) => string;
}

/** Single-series trend line — daily income (PRD §5.4's literal "trend lines"). */
export function ReportLineChart({
  data,
  xKey,
  yKey,
  label,
  color = CHART_COLORS[0],
  height = 280,
  tickFormatter = compactNumber,
  tooltipFormatter = tickFormatter,
}: ReportLineChartProps) {
  const chartConfig = {
    [yKey]: { label, color },
  } as ChartConfig;

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
          <Line
            type="monotone"
            dataKey={yKey}
            name={label}
            stroke={`var(--color-${yKey})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
