// Threshold parsing/evaluation shared by metric + alert views.

export function parseThreshold(expr) {
  const match = String(expr ?? '').match(/^(<=?|>=?|===?)\s*(.+)$/);
  if (!match) return null;
  return { op: match[1], value: Number.parseFloat(match[2]) };
}

export function evalThreshold(value, expr) {
  const threshold = parseThreshold(expr);
  if (!threshold || Number.isNaN(threshold.value)) return false;
  switch (threshold.op) {
    case '<':
      return value < threshold.value;
    case '<=':
      return value <= threshold.value;
    case '>':
      return value > threshold.value;
    case '>=':
      return value >= threshold.value;
    case '=':
    case '==':
    case '===':
      return value === threshold.value;
    default:
      return false;
  }
}
