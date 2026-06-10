import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL, SERVER } from '../lib/appConfig.js';
import { buildDeterministicCanvasLayout, normalizeRuntimeCanvasLayout } from '../lib/boardCanvasLayout.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { CardShell, readStoredCardWidth } from './CardShell.jsx';

const NODE_WIDTH = 360;
const COLUMN_GAP = 420;
const ROW_GAP = 280;
const STORAGE_VERSION = 2;
const EDGE_CURVATURE_SUBTLE = 0.26;
const EDGE_CURVATURE_BASE = 0.46;
const EDGE_CURVATURE_DRAMATIC = 0.68;

function storageKeyForBoard(boardId) {
  return `demo-board.canvas.${boardId}`;
}

function readCanvasState(boardId) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForBoard(boardId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || (parsed.version !== 1 && parsed.version !== STORAGE_VERSION)) {
      return null;
    }
    return normalizeRuntimeCanvasLayout(parsed);
  } catch {
    return null;
  }
}

function writeCanvasState(boardId, payload) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKeyForBoard(boardId), JSON.stringify({
      version: STORAGE_VERSION,
      ...payload,
    }));
  } catch {
    // Ignore localStorage failures.
  }
}

function sameCardSet(savedCardIds, cardIds) {
  if (!Array.isArray(savedCardIds) || savedCardIds.length !== cardIds.length) {
    return false;
  }

  const left = [...savedCardIds].sort();
  const right = [...cardIds].sort();
  return left.every((cardId, index) => cardId === right[index]);
}

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

function sameStringArray(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sameNodeView(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.id === right.id
    && left.type === right.type
    && left.position?.x === right.position?.x
    && left.position?.y === right.position?.y
    && left.style?.width === right.style?.width
    && left.data?.boardId === right.data?.boardId
    && left.data?.status === right.data?.status
    && left.data?.title === right.data?.title
    && left.data?.selectedToken === right.data?.selectedToken
    && left.data?.isHighlighted === right.data?.isHighlighted
    && left.data?.isDimmed === right.data?.isDimmed
    && left.data?.onTokenToggle === right.data?.onTokenToggle
    && sameStringArray(left.data?.provides, right.data?.provides)
    && sameStringArray(left.data?.providedTokens, right.data?.providedTokens)
    && sameStringArray(left.data?.availableTokens, right.data?.availableTokens)
    && sameStringArray(left.data?.requires, right.data?.requires);
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

function FlowCardNode({ id, data }) {
  const statusTone = getStatusTone(data.status);
  const isRunningCard = data.status === 'running';
  const requiresMissing = data.requires.filter((token) => !data.availableTokens.includes(token));
  const nodeTone = data.isDimmed ? ' is-dimmed' : data.isHighlighted ? ' is-highlighted' : '';

  const renderTokenGem = (token, variant, extraClassName = '') => {
    const active = data.selectedToken === token;
    const handleType = variant === 'provide' ? 'source' : 'target';
    const handlePosition = variant === 'provide' ? Position.Bottom : Position.Top;

    return (
      <div
        key={`${variant}-${id}-${token}`}
        className={`board-token-port board-token-port--${variant}`}
      >
        <Handle
          id={tokenHandleId(variant, token)}
          type={handleType}
          position={handlePosition}
          className={`board-flow-node__handle board-flow-node__handle--token board-flow-node__handle--${variant}`}
        />
        <button
          type="button"
          className={`board-token-gem board-token-gem--button board-token-gem--${variant}${extraClassName}${active ? ' is-selected' : ''}`}
          title={`${variant === 'provide' ? 'Provides' : 'Requires'} ${token}`}
          aria-label={`${variant === 'provide' ? 'Provides' : 'Requires'} ${token}`}
          onClick={() => data.onTokenToggle?.(token)}
        />
      </div>
    );
  };

  return (
    <div className={`board-flow-node ${statusTone}${nodeTone}`}>
      <div className="board-flow-node__tokens board-flow-node__tokens--top">
        {data.requires.length > 0 ? data.requires.map((token) => (
          renderTokenGem(
            token,
            'require',
            `${requiresMissing.includes(token) ? ' is-missing' : ''}${isRunningCard ? ' is-running' : ''}`,
          )
        )) : null}
      </div>
      <div className="board-flow-node__card">
        <CardShell boardId={data.boardId} cardId={id} enableResize />
      </div>
      <div className="board-flow-node__tokens board-flow-node__tokens--bottom">
        {data.provides.length > 0 ? data.provides.map((token) => (
          renderTokenGem(token, 'provide', data.providedTokens.includes(token) ? ' is-active' : '')
        )) : null}
      </div>
    </div>
  );
}

const nodeTypes = {
  boardCard: FlowCardNode,
};

const edgeTypes = {
  leaderLine: LeaderLineEdge,
};

function getMiniMapNodeColor(node) {
  return node?.data?.status === 'running' ? 'rgba(111, 192, 154, 0.92)' : 'rgba(125, 149, 171, 0.58)';
}

function getMiniMapNodeStrokeColor(node) {
  return node?.data?.status === 'running' ? 'rgba(34, 132, 93, 0.96)' : 'rgba(97, 122, 147, 0.34)';
}

function getMiniMapNodeClassName(node) {
  return node?.data?.status === 'running' ? 'is-running' : '';
}

export function BoardCanvas({ boardId, cardIds, cardContents, cardRuntimes, dataObjects, boardUi = null, boardMetadata = null }) {
  const [selectedToken, setSelectedToken] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const persistedCanvasState = useMemo(() => readCanvasState(boardId), [boardId]);
  const managedCanvasState = useMemo(
    () => normalizeRuntimeCanvasLayout(boardMetadata?.runtimeLayout?.canvas),
    [boardMetadata?.runtimeLayout?.canvas],
  );
  const manageBoardsActions = useManageBoards(SERVER, { enabled: false });
  const reusableCanvasState = useMemo(() => {
    if (sameCardSet(persistedCanvasState?.cardIds, cardIds)) {
      return persistedCanvasState;
    }
    if (sameCardSet(managedCanvasState?.cardIds, cardIds)) {
      return managedCanvasState;
    }
    return null;
  }, [cardIds, managedCanvasState, persistedCanvasState]);
  const hasRestoredViewportRef = useRef(false);
  const previousSelectedTokenRef = useRef(null);
  const graph = useMemo(() => buildGraph(cardIds, cardContents, cardRuntimes, dataObjects), [cardIds, cardContents, cardRuntimes, dataObjects]);
  const baseLayout = useMemo(() => buildDeterministicCanvasLayout({
    boardUi,
    cardIds,
    cardContents,
    incoming: graph.incoming,
    outgoing: graph.outgoing,
  }), [boardUi, cardContents, cardIds, graph.incoming, graph.outgoing]);
  const availableTokens = useMemo(() => Object.keys(dataObjects ?? {}), [dataObjects]);

  const resolveStoredPosition = useCallback((cardId) => reusableCanvasState?.positions?.[cardId] ?? null, [reusableCanvasState?.positions]);
  const resolveStoredWidth = useCallback((cardId) => {
    const storedWidth = reusableCanvasState?.widths?.[cardId];
    if (Number.isFinite(storedWidth)) {
      return storedWidth;
    }
    return readStoredCardWidth(boardId, cardId);
  }, [boardId, reusableCanvasState?.widths]);

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

  const persistNodes = useCallback((nextNodes, viewport = null) => {
    const positions = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
    const widths = Object.fromEntries(nextNodes
      .map((node) => [node.id, Number(node.style?.width)])
      .filter(([, width]) => Number.isFinite(width)));
    writeCanvasState(boardId, {
      cardIds: nextNodes.map((node) => node.id),
      positions,
      widths,
      viewport,
    });
  }, [boardId]);

  const persistManagedLayout = useCallback((nextNodes, viewport = null) => {
    if (BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      return;
    }

    const positions = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
    const widths = Object.fromEntries(nextNodes
      .map((node) => [node.id, Number(node.style?.width)])
      .filter(([, width]) => Number.isFinite(width)));

    void manageBoardsActions.saveBoardMeta(boardId, {
      runtimeLayout: {
        canvas: {
          cardIds: nextNodes.map((node) => node.id),
          positions,
          widths,
          viewport,
        },
      },
    }).catch(() => {});
  }, [boardId, manageBoardsActions]);

  const graphNodes = useMemo(() => cardIds.map((cardId) => ({
    id: cardId,
    type: 'boardCard',
    position: resolveStoredPosition(cardId)
      ?? baseLayout.get(cardId)
      ?? { x: 0, y: 0 },
    draggable: true,
    data: {
      boardId,
      status: graph.cards[cardId]?.status ?? 'fresh',
      provides: graph.cards[cardId]?.provides ?? [],
      providedTokens: graph.cards[cardId]?.providesActive ?? [],
      availableTokens,
      requires: graph.cards[cardId]?.requires ?? [],
      title: graph.cards[cardId]?.title ?? cardId,
      selectedToken,
      onTokenToggle: handleTokenToggle,
      isHighlighted: !selectedToken || highlightedNodeIds.has(cardId),
      isDimmed: !!selectedToken && !highlightedNodeIds.has(cardId),
    },
    style: { width: resolveStoredWidth(cardId) ?? baseLayout.get(cardId)?.w ?? NODE_WIDTH },
  })), [availableTokens, baseLayout, boardId, cardIds, graph.cards, handleTokenToggle, highlightedNodeIds, resolveStoredPosition, resolveStoredWidth, selectedToken]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes((currentNodes) => {
      const positionsById = new Map(currentNodes.map((node) => [node.id, node.position]));
      const nextNodes = graphNodes.map((node) => ({
        ...node,
        position: positionsById.get(node.id) ?? node.position,
      }));

      if (currentNodes.length === nextNodes.length && currentNodes.every((node, index) => sameNodeView(node, nextNodes[index]))) {
        return currentNodes;
      }

      return nextNodes;
    });
  }, [graphNodes, setNodes]);

  useEffect(() => {
    setEdges((currentEdges) => {
      const currentById = new Map(currentEdges.map((e) => [e.id, e]));
      let changed = currentEdges.length !== graph.edges.length;
      const nextEdges = graph.edges.map((edge) => {
        const className = [
          'board-flow__edge',
          selectedToken ? (highlightedEdgeIds.has(edge.id) ? 'is-highlighted' : 'is-dimmed') : '',
        ].filter(Boolean).join(' ');
        const prev = currentById.get(edge.id);
        if (prev && prev.className === className && prev.source === edge.source && prev.target === edge.target) {
          return prev;
        }
        changed = true;
        return { ...edge, className };
      });
      return changed ? nextEdges : currentEdges;
    });
  }, [graph.edges, highlightedEdgeIds, selectedToken, setEdges]);

  useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0) {
      return undefined;
    }

    if (!hasRestoredViewportRef.current) {
      hasRestoredViewportRef.current = true;
      previousSelectedTokenRef.current = selectedToken;

      const frameId = window.requestAnimationFrame(() => {
        if (reusableCanvasState?.viewport) {
          reactFlowInstance.setViewport(reusableCanvasState.viewport, { duration: 0 });
          return;
        }

        reactFlowInstance.fitView({
          nodes,
          duration: 0,
          padding: 0.18,
          minZoom: 0.35,
          maxZoom: 1.08,
        });
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    if (previousSelectedTokenRef.current === selectedToken) {
      return undefined;
    }

    previousSelectedTokenRef.current = selectedToken;

    const focusedNodeIds = selectedToken ? [...highlightedNodeIds] : cardIds;
    const focusedNodes = nodes.filter((node) => focusedNodeIds.includes(node.id));

    if (focusedNodes.length === 0) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        nodes: focusedNodes,
        duration: 280,
        padding: selectedToken ? 0.3 : 0.18,
        minZoom: selectedToken ? 0.5 : 0.35,
        maxZoom: 1.08,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [cardIds, highlightedNodeIds, nodes, reactFlowInstance, reusableCanvasState?.viewport, selectedToken]);

  const latestPersistRef = useRef(null);
  latestPersistRef.current = () => {
    if (!nodes.length) return;
    const viewport = reactFlowInstance?.getViewport?.() ?? null;
    persistNodes(nodes, viewport);
    persistManagedLayout(nodes, viewport);
  };

  useEffect(() => {
    const handler = () => latestPersistRef.current?.();
    window.addEventListener('demo-board:persist-canvas', handler);
    return () => {
      window.removeEventListener('demo-board:persist-canvas', handler);
      latestPersistRef.current?.();
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail;
      if (!detail || detail.boardId !== boardId || !detail.cardId) {
        return;
      }

      setNodes((currentNodes) => {
        let changed = false;
        const nextNodes = currentNodes.map((node) => {
          if (node.id !== detail.cardId) {
            return node;
          }
          const nextWidth = Number.isFinite(Number(detail.width)) ? Number(detail.width) : NODE_WIDTH;
          if (Number(node.style?.width) === nextWidth) {
            return node;
          }
          changed = true;
          return {
            ...node,
            style: {
              ...(node.style ?? {}),
              width: nextWidth,
            },
          };
        });

        if (changed) {
          const viewport = reactFlowInstance?.getViewport?.() ?? null;
          persistNodes(nextNodes, viewport);
        }

        return changed ? nextNodes : currentNodes;
      });
    };

    window.addEventListener('demo-board:card-width-changed', handler);
    return () => window.removeEventListener('demo-board:card-width-changed', handler);
  }, [boardId, persistNodes, reactFlowInstance, setNodes]);

  const focusedCardIdRef = useRef(null);
  const savedViewportRef = useRef(null);

  useEffect(() => {
    if (!reactFlowInstance) return undefined;

    const handler = (event) => {
      const detail = event?.detail;
      if (!detail || detail.boardId !== boardId || !detail.cardId) return;

      const cardId = detail.cardId;

      if (focusedCardIdRef.current === cardId) {
        const saved = savedViewportRef.current;
        focusedCardIdRef.current = null;
        savedViewportRef.current = null;
        if (saved) {
          reactFlowInstance.setViewport(saved, { duration: 280 });
        }
        return;
      }

      const node = reactFlowInstance.getNode?.(cardId);
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
        savedViewportRef.current = reactFlowInstance.getViewport?.() ?? null;
      }
      focusedCardIdRef.current = cardId;

      const centerX = (node.position?.x ?? 0) + nodeWidth / 2;
      const centerY = (node.position?.y ?? 0) + nodeHeight / 2;

      reactFlowInstance.setCenter(centerX, centerY, { zoom: targetZoom, duration: 280 });
    };

    window.addEventListener('demo-board:toggle-card-focus', handler);
    return () => window.removeEventListener('demo-board:toggle-card-focus', handler);
  }, [boardId, reactFlowInstance]);

  return (
    <div className="board-centre-canvas__viewport">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        minZoom={0.24}
        maxZoom={1.35}
        defaultEdgeOptions={{
          type: 'leaderLine',
          style: { stroke: 'var(--color-accent)', strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
        className="board-react-flow"
        panOnScroll
        selectionOnDrag
        onInit={setReactFlowInstance}
        onNodeDragStop={() => {
          const viewport = reactFlowInstance?.getViewport?.() ?? null;
          persistNodes(nodes, viewport);
        }}
      >
        {selectedToken ? (
          <div className="board-canvas-token-banner">
            <span className="board-canvas-token-banner__label">Token focus</span>
            <button type="button" className="board-token-gem board-token-gem--button is-selected" onClick={() => setSelectedToken(null)}>
              {selectedToken}
              <span className="board-canvas-token-banner__dismiss">×</span>
            </button>
          </div>
        ) : null}
        <MiniMap
          pannable
          zoomable
          className="board-react-flow__minimap"
          nodeColor={getMiniMapNodeColor}
          nodeStrokeColor={getMiniMapNodeStrokeColor}
          nodeStrokeWidth={1.5}
          nodeClassName={getMiniMapNodeClassName}
        />
        <Controls className="board-react-flow__controls" showInteractive={false} />
        <Background gap={24} size={1.1} color="var(--color-border-strong)" className="board-react-flow__background" />
      </ReactFlow>
    </div>
  );
}