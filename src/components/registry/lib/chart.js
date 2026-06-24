// Chart palette + variant detection. `detectChartType` is the chart entry's
// `resolveVariant` (pie / line / bar) — it never swaps the Component.

export const CHART_PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

export const LEGEND_STYLE = { fontSize: 11 };

export function detectChartType(data) {
  if (!Array.isArray(data) || !data.length) return 'bar';
  const sample = data[0];
  if (sample?.label !== undefined && sample?.value !== undefined && sample?.x === undefined && sample?.date === undefined) {
    return 'pie';
  }
  if (sample?.x !== undefined || sample?.date !== undefined) return 'line';
  return 'bar';
}

// Normalizes raw chart data into { rows, labelKey, seriesKeys }. Accepts
// Chart.js-shaped { labels, datasets }, primitive arrays, or object-row arrays.
export function normalizeChartData({ data, viewData = {} }) {
  if (data && !Array.isArray(data) && typeof data === 'object'
      && Array.isArray(data.labels) && Array.isArray(data.datasets)) {
    const labels = data.labels;
    const datasets = data.datasets;
    const seriesNames = datasets.map((d, i) => d?.label ?? `series${i + 1}`);
    const rows = labels.map((label, i) => {
      const row = { __label: label };
      datasets.forEach((d, j) => {
        const val = Array.isArray(d?.data) ? d.data[i] : undefined;
        row[seriesNames[j]] = val;
      });
      return row;
    });
    return { rows, labelKey: '__label', seriesKeys: seriesNames };
  }

  if (!Array.isArray(data) || !data.length) return null;

  if (typeof data[0] !== 'object' || data[0] === null) {
    const rows = data.map((v, i) => ({ __label: String(i + 1), value: v }));
    return { rows, labelKey: '__label', seriesKeys: ['value'] };
  }

  const columns = Array.isArray(viewData.columns) ? viewData.columns : null;
  const allKeys = Object.keys(data[0] ?? {});
  const labelKey = columns?.[0] ?? viewData.labelKey ?? viewData.xKey ?? allKeys[0];
  let seriesKeys;
  if (Array.isArray(viewData.series) && viewData.series.length) {
    seriesKeys = viewData.series;
  } else if (columns && columns.length > 1) {
    seriesKeys = columns.slice(1);
  } else {
    seriesKeys = allKeys.filter((k) => k !== labelKey && typeof data[0][k] === 'number');
    if (!seriesKeys.length) seriesKeys = allKeys.filter((k) => k !== labelKey).slice(0, 1);
  }
  return { rows: data, labelKey, seriesKeys };
}

// The chart entry's resolveVariant: an explicit spec.chartType wins, otherwise
// the type is detected from the normalized rows.
export function resolveChartVariant(spec, data) {
  if (spec?.chartType) return spec.chartType;
  const normalized = normalizeChartData({ data, viewData: spec ?? {} });
  return detectChartType(normalized?.rows ?? []);
}
