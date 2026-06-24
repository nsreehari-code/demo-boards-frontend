import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { CHART_PALETTE, LEGEND_STYLE, normalizeChartData } from '../registry/lib/chart.js';

function MeasuredChart({ height, children }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {width > 0
        ? React.cloneElement(children, { width, height })
        : null}
    </div>
  );
}

/**
 * Reusable, read-only chart renderer (recharts). The chart type comes from
 * `variant` (resolved upstream); it never swaps the component. Chart config and
 * series data are read from `spec` + `data` via `normalizeChartData`.
 *
 * Props:
 *   spec    – chart view config ({ stacked, legend, grid, height, ... })
 *   variant – chart type ('bar' | 'line' | 'area' | 'scatter' | 'pie' | 'doughnut')
 *   data    – series data
 */
export function Chart({ spec = {}, variant, data }) {
  const normalized = useMemo(() => normalizeChartData({ data, viewData: spec }), [data, spec]);

  if (!normalized || !normalized.rows.length || !normalized.seriesKeys.length) {
    return <p className="board-text-muted small mb-0">No chart data</p>;
  }

  const { rows, labelKey, seriesKeys } = normalized;
  const chartType = variant ?? 'bar';
  const stacked = spec.stacked === true;
  const showLegend = spec.legend !== false && (seriesKeys.length > 1 || chartType === 'pie' || chartType === 'doughnut');
  const showGrid = spec.grid !== false;

  let chart;
  if (chartType === 'pie' || chartType === 'doughnut') {
    const valueKey = seriesKeys[0];
    const inner = chartType === 'doughnut' ? '55%' : 0;
    chart = (
      <PieChart>
        <Pie
          data={rows}
          dataKey={valueKey}
          nameKey={labelKey}
          innerRadius={inner}
          outerRadius="80%"
          paddingAngle={1}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
      </PieChart>
    );
  } else if (chartType === 'line' || chartType === 'area') {
    const ChartC = chartType === 'area' ? AreaChart : LineChart;
    const SeriesC = chartType === 'area' ? Area : Line;
    chart = (
      <ChartC data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
        <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        {seriesKeys.map((key, i) => (
          <SeriesC
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
            fillOpacity={chartType === 'area' ? 0.3 : 1}
            stackId={stacked ? 'stack' : undefined}
            dot={false}
          />
        ))}
      </ChartC>
    );
  } else if (chartType === 'scatter') {
    const xKey = labelKey;
    const yKey = seriesKeys[0];
    chart = (
      <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis dataKey={yKey} tick={{ fontSize: 10 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={rows} fill={CHART_PALETTE[0]} />
      </ScatterChart>
    );
  } else {
    chart = (
      <BarChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
        <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        {seriesKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </BarChart>
    );
  }

  const height = spec.height ?? 220;
  return <MeasuredChart height={height}>{chart}</MeasuredChart>;
}
