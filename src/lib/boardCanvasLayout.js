const DEFAULT_CANVAS_LAYOUT = {
  defaultCardWidth: 360,
  defaultCardHeight: 240,
  columnGap: 420,
  rowGap: 280,
  origin: { x: 40, y: 40 },
};

const FOOTPRINT_WIDTH = {
  compact: 300,
  standard: 360,
  wide: 440,
  large: 520,
};

// Lower weight is placed earlier / nearer the top of its column.
const PROMINENCE_ORDER = {
  spotlight: 0,
  feature: 1,
  standard: 2,
  glance: 3,
};
const DEFAULT_PROMINENCE_WEIGHT = PROMINENCE_ORDER.standard;

function normalizeFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function resolveBoardCanvasLayoutConfig(boardUi) {
  const candidate = normalizeObject(boardUi?.canvasLayout);
  const origin = normalizeObject(candidate?.origin);

  return {
    defaultCardWidth: normalizeFiniteNumber(candidate?.defaultCardWidth) ?? DEFAULT_CANVAS_LAYOUT.defaultCardWidth,
    defaultCardHeight: normalizeFiniteNumber(candidate?.defaultCardHeight) ?? DEFAULT_CANVAS_LAYOUT.defaultCardHeight,
    columnGap: normalizeFiniteNumber(candidate?.columnGap) ?? DEFAULT_CANVAS_LAYOUT.columnGap,
    rowGap: normalizeFiniteNumber(candidate?.rowGap) ?? DEFAULT_CANVAS_LAYOUT.rowGap,
    origin: {
      x: normalizeFiniteNumber(origin?.x) ?? DEFAULT_CANVAS_LAYOUT.origin.x,
      y: normalizeFiniteNumber(origin?.y) ?? DEFAULT_CANVAS_LAYOUT.origin.y,
    },
  };
}

function resolvePresentation(card) {
  return normalizeObject(card?.meta?.presentation) ?? {};
}

function resolveProminenceWeight(presentation) {
  if (typeof presentation.prominence === 'string') {
    const weight = PROMINENCE_ORDER[presentation.prominence.trim()];
    if (Number.isFinite(weight)) {
      return weight;
    }
  }
  return DEFAULT_PROMINENCE_WEIGHT;
}

function resolveColumn(depth) {
  return Number.isFinite(depth) ? depth : 0;
}

function resolveCardWidth(config, presentation) {
  if (typeof presentation.footprint === 'string') {
    return FOOTPRINT_WIDTH[presentation.footprint.trim()] ?? config.defaultCardWidth;
  }
  return config.defaultCardWidth;
}

function buildDepthMap(cardIds, incoming, outgoing) {
  const indegree = new Map(cardIds.map((cardId) => [cardId, incoming.get(cardId)?.size ?? 0]));
  const depth = new Map(cardIds.map((cardId) => [cardId, 0]));
  const queue = cardIds.filter((cardId) => (indegree.get(cardId) ?? 0) === 0);
  const visited = new Set();

  while (queue.length > 0) {
    const cardId = queue.shift();
    visited.add(cardId);
    const nextDepth = (depth.get(cardId) ?? 0) + 1;
    for (const nextId of outgoing.get(cardId) ?? []) {
      depth.set(nextId, Math.max(depth.get(nextId) ?? 0, nextDepth));
      const remaining = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, remaining);
      if (remaining === 0) {
        queue.push(nextId);
      }
    }
  }

  for (const cardId of cardIds) {
    if (!visited.has(cardId)) {
      depth.set(cardId, depth.get(cardId) ?? 0);
    }
  }

  return depth;
}

export function normalizeRuntimeCanvasLayout(layout) {
  const candidate = normalizeObject(layout);
  if (!candidate) {
    return null;
  }

  const positions = normalizeObject(candidate.positions) ?? {};
  const widths = normalizeObject(candidate.widths) ?? {};
  const normalizedPositions = {};
  const normalizedWidths = {};

  for (const [cardId, position] of Object.entries(positions)) {
    const x = normalizeFiniteNumber(position?.x);
    const y = normalizeFiniteNumber(position?.y);
    if (x == null || y == null) {
      continue;
    }
    normalizedPositions[cardId] = { x, y };
  }

  for (const [cardId, width] of Object.entries(widths)) {
    const normalizedWidth = normalizeFiniteNumber(width);
    if (normalizedWidth != null) {
      normalizedWidths[cardId] = normalizedWidth;
    }
  }

  const viewport = normalizeObject(candidate.viewport);
  return {
    cardIds: Array.isArray(candidate.cardIds) ? candidate.cardIds.filter((entry) => typeof entry === 'string' && entry) : Object.keys(normalizedPositions),
    positions: normalizedPositions,
    widths: normalizedWidths,
    viewport: viewport && normalizeFiniteNumber(viewport.x) != null && normalizeFiniteNumber(viewport.y) != null && normalizeFiniteNumber(viewport.zoom) != null
      ? {
        x: normalizeFiniteNumber(viewport.x),
        y: normalizeFiniteNumber(viewport.y),
        zoom: normalizeFiniteNumber(viewport.zoom),
      }
      : null,
  };
}

export function buildDeterministicCanvasLayout({
  boardUi,
  cardIds,
  cardContents,
  incoming,
  outgoing,
}) {
  const config = resolveBoardCanvasLayoutConfig(boardUi);
  const depthMap = buildDepthMap(cardIds, incoming, outgoing);
  const placements = new Map();
  const columnRows = new Map();

  const cardDescriptors = cardIds.map((cardId) => {
    const card = cardContents[cardId] ?? {};
    const presentation = resolvePresentation(card);
    return {
      cardId,
      column: resolveColumn(depthMap.get(cardId) ?? 0),
      prominence: resolveProminenceWeight(presentation),
      title: typeof card?.meta?.title === 'string' ? card.meta.title : cardId,
      width: resolveCardWidth(config, presentation),
    };
  });

  cardDescriptors.sort((left, right) => {
    if (left.column !== right.column) return left.column - right.column;
    if (left.prominence !== right.prominence) return left.prominence - right.prominence;
    return left.title.localeCompare(right.title);
  });

  for (const descriptor of cardDescriptors) {
    const rowIndex = columnRows.get(descriptor.column) ?? 0;
    columnRows.set(descriptor.column, rowIndex + 1);
    placements.set(descriptor.cardId, {
      x: config.origin.x + (descriptor.column * config.columnGap),
      y: config.origin.y + (rowIndex * config.rowGap),
      w: descriptor.width,
      h: config.defaultCardHeight,
    });
  }

  return placements;
}