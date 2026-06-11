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

function resolveCardWidth(config, presentation) {
  if (typeof presentation.footprint === 'string') {
    return FOOTPRINT_WIDTH[presentation.footprint.trim()] ?? config.defaultCardWidth;
  }
  return config.defaultCardWidth;
}

function resolveCardHeight(config, card) {
  const legacyCanvas = normalizeObject(card?.view?.layout?.canvas);
  const legacyHeight = normalizeFiniteNumber(legacyCanvas?.h);
  if (legacyHeight != null && legacyHeight > 0) {
    return legacyHeight;
  }
  return config.defaultCardHeight;
}

function resolveStoredPosition(storedPositions, cardId) {
  const position = normalizeObject(storedPositions?.[cardId]);
  const x = normalizeFiniteNumber(position?.x);
  const y = normalizeFiniteNumber(position?.y);
  if (x == null || y == null) {
    return null;
  }
  return { x, y };
}

function resolveStoredWidth(storedWidths, cardId) {
  return normalizeFiniteNumber(storedWidths?.[cardId]);
}

function rectanglesOverlap(left, right) {
  return left.x < (right.x + right.w)
    && (left.x + left.w) > right.x
    && left.y < (right.y + right.h)
    && (left.y + left.h) > right.y;
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

function restrictAdjacency(cardIds, adjacency) {
  const allowed = new Set(cardIds);
  return new Map(cardIds.map((cardId) => [
    cardId,
    new Set([...(adjacency.get(cardId) ?? [])].filter((neighborId) => allowed.has(neighborId))),
  ]));
}

function buildWeaklyConnectedComponents(cardIds, incoming, outgoing) {
  const remaining = new Set(cardIds);
  const components = [];

  while (remaining.size > 0) {
    const [seedId] = remaining;
    const queue = [seedId];
    const component = [];
    remaining.delete(seedId);

    while (queue.length > 0) {
      const cardId = queue.shift();
      component.push(cardId);

      for (const neighborId of incoming.get(cardId) ?? []) {
        if (!remaining.has(neighborId)) continue;
        remaining.delete(neighborId);
        queue.push(neighborId);
      }

      for (const neighborId of outgoing.get(cardId) ?? []) {
        if (!remaining.has(neighborId)) continue;
        remaining.delete(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(component);
  }

  return components;
}

function measureComponentLayout(componentPlacements) {
  let width = 0;
  let height = 0;

  for (const placement of componentPlacements.values()) {
    width = Math.max(width, placement.x + placement.w);
    height = Math.max(height, placement.y + placement.h);
  }

  return { width, height };
}

function findOpenPosition(bounds, occupiedRects, config) {
  const maxColumns = Math.max(1, Math.ceil(Math.sqrt(occupiedRects.length + 1)) + 2);

  for (let rowIndex = 0; rowIndex < 200; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
      const candidate = {
        x: config.origin.x + (columnIndex * config.columnGap),
        y: config.origin.y + (rowIndex * config.rowGap),
        w: bounds.width,
        h: bounds.height,
      };
      if (!occupiedRects.some((occupiedRect) => rectanglesOverlap(candidate, occupiedRect))) {
        return candidate;
      }
    }
  }

  return {
    x: config.origin.x,
    y: config.origin.y,
    w: bounds.width,
    h: bounds.height,
  };
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
  storedPositions,
  storedWidths,
}) {
  const config = resolveBoardCanvasLayoutConfig(boardUi);
  const placements = new Map();
  const occupiedRects = [];

  const cardDescriptors = cardIds.map((cardId) => {
    const card = cardContents[cardId] ?? {};
    const presentation = resolvePresentation(card);
    const storedPosition = resolveStoredPosition(storedPositions, cardId);
    return {
      cardId,
      prominence: resolveProminenceWeight(presentation),
      title: typeof card?.meta?.title === 'string' ? card.meta.title : cardId,
      width: resolveCardWidth(config, presentation),
      height: resolveCardHeight(config, card),
      storedPosition,
      storedWidth: resolveStoredWidth(storedWidths, cardId),
    };
  });

  for (const descriptor of cardDescriptors) {
    if (!descriptor.storedPosition) {
      continue;
    }
    occupiedRects.push({
      x: descriptor.storedPosition.x,
      y: descriptor.storedPosition.y,
      w: descriptor.storedWidth ?? descriptor.width,
      h: descriptor.height,
    });
  }

  const unsavedDescriptors = cardDescriptors.filter((descriptor) => !descriptor.storedPosition);
  const unsavedIds = unsavedDescriptors.map((descriptor) => descriptor.cardId);
  const unsavedIncoming = restrictAdjacency(unsavedIds, incoming);
  const unsavedOutgoing = restrictAdjacency(unsavedIds, outgoing);
  const depthMap = buildDepthMap(unsavedIds, unsavedIncoming, unsavedOutgoing);
  const descriptorsById = new Map(cardDescriptors.map((descriptor) => [descriptor.cardId, descriptor]));

  const components = buildWeaklyConnectedComponents(unsavedIds, unsavedIncoming, unsavedOutgoing)
    .sort((left, right) => {
      const leftDepth = Math.min(...left.map((cardId) => depthMap.get(cardId) ?? 0));
      const rightDepth = Math.min(...right.map((cardId) => depthMap.get(cardId) ?? 0));
      if (leftDepth !== rightDepth) return leftDepth - rightDepth;
      const leftTitle = [...left].map((cardId) => descriptorsById.get(cardId)?.title ?? cardId).sort()[0] ?? '';
      const rightTitle = [...right].map((cardId) => descriptorsById.get(cardId)?.title ?? cardId).sort()[0] ?? '';
      return leftTitle.localeCompare(rightTitle);
    });

  components.forEach((componentIds) => {
    const componentIncoming = restrictAdjacency(componentIds, unsavedIncoming);
    const componentOutgoing = restrictAdjacency(componentIds, unsavedOutgoing);
    const componentDepthMap = buildDepthMap(componentIds, componentIncoming, componentOutgoing);
    const columnY = new Map();
    const componentPlacements = new Map();

    componentIds
      .map((cardId) => ({
        ...descriptorsById.get(cardId),
        column: componentDepthMap.get(cardId) ?? 0,
      }))
      .sort((left, right) => {
        if (left.column !== right.column) return left.column - right.column;
        if (left.prominence !== right.prominence) return left.prominence - right.prominence;
        return left.title.localeCompare(right.title);
      })
      .forEach((descriptor) => {
        const y = columnY.get(descriptor.column) ?? 0;
        componentPlacements.set(descriptor.cardId, {
          x: descriptor.column * config.columnGap,
          y,
          w: descriptor.width,
          h: descriptor.height,
        });
        columnY.set(descriptor.column, y + descriptor.height + config.rowGap);
      });

    const bounds = measureComponentLayout(componentPlacements);
    const anchor = findOpenPosition(bounds, occupiedRects, config);

    for (const [cardId, placement] of componentPlacements.entries()) {
      const absolutePlacement = {
        x: anchor.x + placement.x,
        y: anchor.y + placement.y,
        w: placement.w,
        h: placement.h,
      };
      placements.set(cardId, absolutePlacement);
      occupiedRects.push(absolutePlacement);
    }
  });

  return placements;
}