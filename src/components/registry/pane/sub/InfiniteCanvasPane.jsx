import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  Handle,
  getBezierPath,
} from '@xyflow/react';
import { buildDeterministicCanvasLayout } from '../../../../lib/boardCanvasLayout.js';
import { useBoardLayoutActions, useBoardLayoutState } from '../../../../hooks/useCoordsState.jsx';
import { CardRenderer } from '../../../renderers/CardRenderer.jsx';
import { InfiniteCanvas } from '../../../shared/InfiniteCanvas.jsx';

const NODE_WIDTH = 360;
const EDGE_CURVATURE_SUBTLE = 0.26;
const EDGE_CURVATURE_BASE = 0.46;
const EDGE_CURVATURE_DRAMATIC = 0.68;

function tokenHandleId(kind, token) {
  return `${kind}:${token}`;
}

function getStatusTone(status) {
  switch (status) {
    case 'completed':
      return 'board-tone--completed';
    case 'running':
      return 'board-tone--running';
    case 'failed':
      return 'board-tone--failed';
    case 'blocked':
      return 'board-tone--blocked';
    default:
      return 'board-tone--fresh';
  }
}

function uniqueTokens(tokens = []) {
  return [...new Set((Array.isArray(tokens) ? tokens : []).filter(Boolean).map(String))];
}

function resolveRequiredTokens(card) {
  if (Array.isArray(card?.requires)) {
    return uniqueTokens(card.requires);
  }
  if (card?.requires && typeof card.requires === 'object') {
    return uniqueTokens(Object.keys(card.requires));
  }
  return [];
}

function resolveProvidedTokens(card) {
  const provideDefs = Array.isArray(card?.provides) ? card.provides : [];
  const explicitTokens = provideDefs.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    if (entry && typeof entry === 'object' && typeof entry.bindTo === 'string') {
      return entry.bindTo;
    }
    return null;
  });

  return uniqueTokens(explicitTokens);
}

function buildGraph(cardIds, cardContents, cardRuntimes, dataObjects) {
  const visibleIds = new Set(cardIds);
  const cards = {};
  const tokenProviders = new Map();

  for (const cardId of cardIds) {
    const card = cardContents[cardId] ?? {};
    const status = cardRuntimes[cardId]?.status ?? 'fresh';
    const requires = resolveRequiredTokens(card);
    const provides = resolveProvidedTokens(card);
    const providesActive = provides.filter((token) => token in (dataObjects ?? {}));

    cards[cardId] = {
      id: cardId,
      title: card.meta?.title ?? cardId,
      status,
      requires,
      provides,
      providesActive,
    };

    for (const token of provides) {
      const providers = tokenProviders.get(token) ?? [];
      providers.push(cardId);
      tokenProviders.set(token, providers);
    }
  }

  const edges = [];
  const incoming = new Map(cardIds.map((cardId) => [cardId, new Set()]));
  const outgoing = new Map(cardIds.map((cardId) => [cardId, new Set()]));

  for (const cardId of cardIds) {
    const card = cards[cardId];
    for (const token of card.requires) {
      const providers = tokenProviders.get(token) ?? [];
      for (const sourceId of providers) {
        if (sourceId === cardId || !visibleIds.has(sourceId)) {
          continue;
        }
        const isRunningEdge = card.status === 'running';
        edges.push({
          id: `${sourceId}::${cardId}::${token}`,
          source: sourceId,
          target: cardId,
          sourceHandle: tokenHandleId('provide', token),
          targetHandle: tokenHandleId('require', token),
          label: token,
          data: { token, isRunning: isRunningEdge },
          type: 'leaderLine',
          animated: isRunningEdge,
          className: 'board-flow__edge',
        });
        incoming.get(cardId)?.add(sourceId);
        outgoing.get(sourceId)?.add(cardId);
      }
    }
  }

  return { cards, edges, incoming, outgoing };
}

function resolveLeaderCurve(sourceX, sourceY, targetX, targetY, emphasis = 'base') {
  const horizontalDistance = Math.abs(targetX - sourceX);
  const verticalDistance = Math.abs(targetY - sourceY);

  if (horizontalDistance < 180 && verticalDistance < 120) {
    return EDGE_CURVATURE_SUBTLE;
  }

  if (horizontalDistance > 520 || verticalDistance > 320) {
    return emphasis === 'dramatic' ? EDGE_CURVATURE_DRAMATIC : 0.58;
  }

  return emphasis === 'dramatic' ? 0.58 : EDGE_CURVATURE_BASE;
}

function LeaderLineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  className,
  data,
  style,
}) {
  const isHighlighted = className?.includes('is-highlighted');
  const isDimmed = className?.includes('is-dimmed');
  const isRunning = Boolean(data?.isRunning);
  const curvature = resolveLeaderCurve(
    sourceX,
    sourceY,
    targetX,
    targetY,
    isHighlighted || isRunning ? 'dramatic' : 'base',
  );
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature,
  });
  const baseStrokeColor = 'rgba(83, 133, 137, 0.58)';
  const highlightStrokeColor = 'rgba(71, 122, 136, 0.78)';
  const dimStrokeColor = 'rgba(83, 133, 137, 0.2)';
  const strokeColor = isHighlighted
    ? highlightStrokeColor
    : isDimmed
      ? dimStrokeColor
      : baseStrokeColor;
  const flowColor = isHighlighted ? 'rgba(146, 208, 213, 0.86)' : 'rgba(166, 216, 220, 0.74)';
  const plugMarkerId = `${id}-plug`;
  const endPlugMarkerId = `${id}-end-plug`;
  const mainStrokeWidth = isHighlighted ? 2.4 : 1.7;

  return (
    <>
      <defs>
        <marker
          id={plugMarkerId}
          viewBox="0 0 10 10"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="5"
        >
          <circle cx="5" cy="5" r="3" fill={strokeColor} />
        </marker>
        <marker
          id={endPlugMarkerId}
          viewBox="0 0 12 12"
          markerWidth="8.5"
          markerHeight="8.5"
          refX="6"
          refY="6"
          orient="auto-start-reverse"
        >
          <circle cx="6" cy="6" r="3.9" fill={strokeColor} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        className="board-flow__edge-main"
        markerStart={`url(#${plugMarkerId})`}
        markerEnd={markerEnd ?? `url(#${endPlugMarkerId})`}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: mainStrokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
      {isRunning ? (
        <BaseEdge
          id={`${id}-flow`}
          path={edgePath}
          className="board-flow__edge-flow"
          style={{
            stroke: flowColor,
            strokeWidth: mainStrokeWidth + 0.35,
          }}
        />
      ) : null}
    </>
  );
}

const edgeTypes = {
  leaderLine: LeaderLineEdge,
};

function miniMapNodeStatus(node) {
  return node?.data?.__node?.status;
}

function getMiniMapNodeColor(node) {
  return miniMapNodeStatus(node) === 'running' ? 'rgba(111, 192, 154, 0.92)' : 'rgba(125, 149, 171, 0.58)';
}

function getMiniMapNodeStrokeColor(node) {
  return miniMapNodeStatus(node) === 'running' ? 'rgba(34, 132, 93, 0.96)' : 'rgba(97, 122, 147, 0.34)';
}

function getMiniMapNodeClassName(node) {
  return miniMapNodeStatus(node) === 'running' ? 'is-running' : '';
}

export function InfiniteCanvasPane({ boardId, cardIds, cardContents, cardRuntimes, dataObjects, rendererRules = [] }) {
  const [selectedToken, setSelectedToken] = useState(null);
  const layoutState = useBoardLayoutState();
  const { setManyCoords, setViewport, scheduleAutosave } = useBoardLayoutActions();
  const canvasRef = useRef(null);
  const focusedCardIdRef = useRef(null);
  const savedViewportRef = useRef(null);
  const tokenRefitInitRef = useRef(false);

  const graph = useMemo(() => buildGraph(cardIds, cardContents, cardRuntimes, dataObjects), [cardIds, cardContents, cardRuntimes, dataObjects]);
  const baseLayout = useMemo(() => buildDeterministicCanvasLayout({
    cardIds,
    cardContents,
    incoming: graph.incoming,
    outgoing: graph.outgoing,
    storedPositions: layoutState.positions,
    storedWidths: layoutState.widths,
  }), [cardContents, cardIds, graph.incoming, graph.outgoing, layoutState.positions, layoutState.widths]);
  const availableTokens = useMemo(() => Object.keys(dataObjects ?? {}), [dataObjects]);

  const highlightedEdgeIds = useMemo(() => {
    if (!selectedToken) {
      return new Set();
    }
    return new Set(
      graph.edges
        .filter((edge) => edge.data?.token === selectedToken)
        .map((edge) => edge.id),
    );
  }, [graph.edges, selectedToken]);

  const highlightedNodeIds = useMemo(() => {
    if (!selectedToken) {
      return new Set();
    }

    return new Set(cardIds.filter((cardId) => {
      const card = graph.cards[cardId];
      return card?.requires.includes(selectedToken) || card?.provides.includes(selectedToken);
    }));
  }, [cardIds, graph.cards, selectedToken]);

  const handleTokenToggle = useCallback((token) => {
    setSelectedToken((currentToken) => (currentToken === token ? null : token));
  }, []);

  // --- generic InfiniteCanvas inputs ---

  const nodeDescriptors = useMemo(() => cardIds.map((cardId) => {
    const card = graph.cards[cardId];
    const highlighted = !selectedToken || highlightedNodeIds.has(cardId);
    const dimmed = !!selectedToken && !highlightedNodeIds.has(cardId);
    const storedWidth = layoutState.widths?.[cardId];
    const width = Number.isFinite(storedWidth) ? storedWidth : (baseLayout.get(cardId)?.w ?? NODE_WIDTH);
    return {
      id: cardId,
      status: card?.status ?? 'fresh',
      highlighted,
      dimmed,
      width,
    };
  }), [baseLayout, cardIds, graph.cards, highlightedNodeIds, layoutState.widths, selectedToken]);

  const nodePorts = useMemo(() => {
    const map = new Map();
    for (const cardId of cardIds) {
      const card = graph.cards[cardId];
      if (!card) {
        continue;
      }
      const isRunningCard = card.status === 'running';
      const top = card.requires.map((token) => {
        const missing = !availableTokens.includes(token);
        const selected = selectedToken === token;
        return {
          id: `require:${token}`,
          variant: 'require',
          handleId: tokenHandleId('require', token),
          handleType: 'target',
          title: `Requires ${token}`,
          ariaLabel: `Requires ${token}`,
          className: `board-token-gem board-token-gem--button board-token-gem--require${missing ? ' is-missing' : ''}${isRunningCard ? ' is-running' : ''}${selected ? ' is-selected' : ''}`,
          onClick: () => handleTokenToggle(token),
        };
      });
      const bottom = card.provides.map((token) => {
        const active = card.providesActive.includes(token);
        const selected = selectedToken === token;
        return {
          id: `provide:${token}`,
          variant: 'provide',
          handleId: tokenHandleId('provide', token),
          handleType: 'source',
          title: `Provides ${token}`,
          ariaLabel: `Provides ${token}`,
          className: `board-token-gem board-token-gem--button board-token-gem--provide${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`,
          onClick: () => handleTokenToggle(token),
        };
      });
      map.set(cardId, { top, bottom });
    }
    return map;
  }, [availableTokens, cardIds, graph.cards, handleTokenToggle, selectedToken]);

  const edges = useMemo(() => graph.edges.map((edge) => {
    const className = [
      'board-flow__edge',
      selectedToken ? (highlightedEdgeIds.has(edge.id) ? 'is-highlighted' : 'is-dimmed') : '',
    ].filter(Boolean).join(' ');
    return { ...edge, className };
  }), [graph.edges, highlightedEdgeIds, selectedToken]);

  // Canvas blob owns only geometry (positions) + viewport. Width is a
  // card-semantic concern persisted separately (layoutState.widths) and fed in
  // through each node descriptor's optional `width` field.
  const canvasState = useMemo(() => {
    const nodes = {};
    for (const cardId of cardIds) {
      const pos = layoutState.positions?.[cardId];
      if (pos) {
        nodes[cardId] = { x: pos.x, y: pos.y };
      }
    }
    return { v: 1, viewport: layoutState.viewport ?? null, nodes };
  }, [cardIds, layoutState.positions, layoutState.viewport]);

  const getInitialNodePos = useCallback((node) => {
    const placement = baseLayout.get(node.id);
    return placement ? { x: placement.x, y: placement.y } : null;
  }, [baseLayout]);

  const handleCanvasStateCommit = useCallback((blob) => {
    const coords = {};
    for (const [id, nodeGeometry] of Object.entries(blob.nodes ?? {})) {
      if (Number.isFinite(nodeGeometry.x) && Number.isFinite(nodeGeometry.y)) {
        coords[id] = { x: nodeGeometry.x, y: nodeGeometry.y };
      }
    }
    if (Object.keys(coords).length > 0) {
      setManyCoords(coords);
    }
    setViewport(blob.viewport ?? null);
    scheduleAutosave();
  }, [scheduleAutosave, setManyCoords, setViewport]);

  const renderNode = useCallback((node) => {
    const tone = getStatusTone(node.status);
    const stateClass = node.dimmed ? ' is-dimmed' : node.highlighted ? ' is-highlighted' : '';
    return (
      <div className={`board-flow-node ${tone}${stateClass}`}>
        <div className="board-flow-node__card">
          <CardRenderer boardId={boardId} cardId={node.id} enableResize rendererRules={rendererRules} chrome="full" />
        </div>
      </div>
    );
  }, [boardId, rendererRules]);

  const renderNodePort = useCallback((port, { position }) => (
    <div className={`board-token-port board-token-port--${port.variant}`}>
      <Handle
        id={port.handleId}
        type={port.handleType}
        position={position}
        className={`board-flow-node__handle board-flow-node__handle--token board-flow-node__handle--${port.variant}`}
      />
      <button
        type="button"
        className={port.className}
        title={port.title}
        aria-label={port.ariaLabel}
        onClick={port.onClick}
        onMouseEnter={port.onMouseEnter}
        onMouseLeave={port.onMouseLeave}
      />
    </div>
  ), []);

  const miniMap = useMemo(() => ({
    className: 'board-react-flow__minimap',
    nodeColor: getMiniMapNodeColor,
    nodeStrokeColor: getMiniMapNodeStrokeColor,
    nodeStrokeWidth: 1.5,
    nodeClassName: getMiniMapNodeClassName,
  }), []);
  const controls = useMemo(() => ({ className: 'board-react-flow__controls' }), []);
  const background = useMemo(() => ({ gap: 24, size: 1.1, color: 'var(--color-border-strong)', className: 'board-react-flow__background' }), []);
  const defaultEdgeOptions = useMemo(() => ({ type: 'leaderLine', style: { stroke: 'var(--color-accent)', strokeWidth: 1.5 } }), []);

  // Reset transient interaction refs on board switch.
  useEffect(() => {
    tokenRefitInitRef.current = false;
    focusedCardIdRef.current = null;
    savedViewportRef.current = null;
  }, [boardId]);

  // Refit on token-focus change. Skip the first run — the canvas owns the
  // initial restore-or-fit.
  useEffect(() => {
    if (!tokenRefitInitRef.current) {
      tokenRefitInitRef.current = true;
      return undefined;
    }
    const api = canvasRef.current;
    if (!api) {
      return undefined;
    }
    const focusedIds = selectedToken ? [...highlightedNodeIds] : cardIds;
    const focusedNodes = focusedIds.map((id) => api.getNode?.(id)).filter(Boolean);
    if (focusedNodes.length === 0) {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(() => {
      api.fitView({
        nodes: focusedNodes,
        duration: 280,
        padding: selectedToken ? 0.3 : 0.18,
        minZoom: selectedToken ? 0.5 : 0.35,
        maxZoom: 1.08,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [cardIds, highlightedNodeIds, selectedToken]);

  // Card-focus toggle: zoom into a single card, toggle back to the saved viewport.
  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail;
      if (!detail || detail.boardId !== boardId || !detail.cardId) return;
      const api = canvasRef.current;
      if (!api) return;

      const cardId = detail.cardId;

      if (focusedCardIdRef.current === cardId) {
        const saved = savedViewportRef.current;
        focusedCardIdRef.current = null;
        savedViewportRef.current = null;
        if (saved) {
          api.setViewport(saved, { duration: 280 });
        }
        return;
      }

      const node = api.getNode?.(cardId);
      if (!node) return;

      const nodeWidth = node.measured?.width ?? node.width ?? NODE_WIDTH;
      const nodeHeight = node.measured?.height ?? node.height;
      const container = document.querySelector('.board-centre-canvas__viewport');
      const viewportHeight = container?.clientHeight ?? window.innerHeight;
      const viewportWidth = container?.clientWidth ?? window.innerWidth;
      if (!nodeHeight || !viewportHeight) return;

      const zoomForHeight = (viewportHeight * 0.9) / nodeHeight;
      const zoomForWidth = (viewportWidth * 0.95) / nodeWidth;
      const targetZoom = Math.min(zoomForHeight, zoomForWidth, 1.35);

      if (focusedCardIdRef.current === null) {
        savedViewportRef.current = api.getViewport?.() ?? null;
      }
      focusedCardIdRef.current = cardId;

      const centerX = (node.position?.x ?? 0) + nodeWidth / 2;
      const centerY = (node.position?.y ?? 0) + nodeHeight / 2;

      api.setCenter(centerX, centerY, { zoom: targetZoom, duration: 280 });
    };

    window.addEventListener('demo-board:toggle-card-focus', handler);
    return () => window.removeEventListener('demo-board:toggle-card-focus', handler);
  }, [boardId]);

  const overlay = selectedToken ? (
    <div className="board-canvas-token-banner">
      <span className="board-canvas-token-banner__label">Token focus</span>
      <button type="button" className="board-token-gem board-token-gem--button is-selected" onClick={() => setSelectedToken(null)}>
        {selectedToken}
        <span className="board-canvas-token-banner__dismiss">×</span>
      </button>
    </div>
  ) : null;

  return (
    <InfiniteCanvas
      ref={canvasRef}
      stateKey={boardId}
      canvasState={canvasState}
      onCanvasStateCommit={handleCanvasStateCommit}
      getInitialNodePos={getInitialNodePos}
      nodes={nodeDescriptors}
      nodePorts={nodePorts}
      renderNode={renderNode}
      renderNodePort={renderNodePort}
      edges={edges}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      minZoom={0.24}
      maxZoom={1.35}
      miniMap={miniMap}
      controls={controls}
      background={background}
      overlay={overlay}
      className="board-react-flow"
      viewportClassName="board-centre-canvas__viewport"
    />
  );
}