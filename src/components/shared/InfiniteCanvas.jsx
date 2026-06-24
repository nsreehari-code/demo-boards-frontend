import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';

// InfiniteCanvas is a generic, registry-agnostic ReactFlow shell. It owns the
// canvas chrome (minimap / zoom-fit controls / background), the viewport
// lifecycle (restore-or-fit on mount + hide-until-ready), the ReactFlow node
// state + drag-position handling, and a node "port frame" (per-side rails that
// host ReactFlow `<Handle>`s). Everything board/registry specific is injected:
//
//   - nodes:          [{ id, body, width?, ...consumerViewState }]  (position-free)
//   - nodePorts:      Map<id, { top?, bottom?, left?, right? }> | Record<id, …>
//   - renderNode:     (node) => ReactNode        — body content (e.g. NodeRenderer)
//   - renderNodePort: (port, { side, position, node }) => ReactNode — Handle + chip
//   - edges/edgeTypes: native ReactFlow edges (consumer-rendered)
//
// Geometry/viewport persistence is a single opaque control blob:
//
//   canvasState = { v, viewport: { x, y, zoom } | null, nodes: { [id]: { x, y } } }
//
// The consumer treats it as opaque: it seeds `canvasState` (re-seeded when
// `stateKey` changes) and persists whatever comes back through
// `onCanvasStateCommit`. Positions are canvas-owned at runtime (live drags win).
// Width is NOT a canvas concern: it is an optional per-node field (`node.width`)
// applied as the node box width but owned/persisted by the consumer in its own
// card-semantic layout store.

const CANVAS_FRAME_TYPE = '__canvasFrame';

const SIDE_POSITION = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

const DEFAULT_BACKGROUND = { gap: 24, size: 1.1, color: 'var(--color-border-strong)' };

// Structural equality that ignores function-valued fields. Two functions are
// always considered equal because they encode behavior, not view — so a node
// whose only difference is a freshly-allocated callback is not re-rendered.
function deepEqualView(a, b) {
  if (a === b) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a !== typeof b) return false;
  if (!a || !b || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqualView(a[key], b[key])) return false;
  }
  return true;
}

const CanvasFrameNode = memo(function CanvasFrameNode({ data }) {
  const node = data.__node;
  const ports = data.__ports;
  const renderNode = data.__renderNode;
  const renderNodePort = data.__renderNodePort;
  const body = renderNode ? renderNode(node) : null;

  const renderRail = (side) => {
    const list = ports?.[side];
    if (!Array.isArray(list) || list.length === 0) return null;
    const position = SIDE_POSITION[side];
    return (
      <div className={`infinite-canvas-node__rail infinite-canvas-node__rail--${side}`}>
        {list.map((port, index) => (
          <React.Fragment key={port?.id ?? `${side}:${index}`}>
            {renderNodePort ? renderNodePort(port, { side, position, node }) : null}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const hasLeft = Array.isArray(ports?.left) && ports.left.length > 0;
  const hasRight = Array.isArray(ports?.right) && ports.right.length > 0;

  return (
    <div className="infinite-canvas-node">
      {renderRail('top')}
      {hasLeft || hasRight ? (
        <div className="infinite-canvas-node__row">
          {renderRail('left')}
          <div className="infinite-canvas-node__body">{body}</div>
          {renderRail('right')}
        </div>
      ) : (
        <div className="infinite-canvas-node__body">{body}</div>
      )}
      {renderRail('bottom')}
    </div>
  );
});

const NODE_TYPES = { [CANVAS_FRAME_TYPE]: CanvasFrameNode };

function normalizeBlob(blob) {
  return {
    v: 1,
    viewport: blob?.viewport ?? null,
    nodes: blob?.nodes && typeof blob.nodes === 'object' ? blob.nodes : {},
  };
}

function readPorts(nodePorts, id) {
  if (!nodePorts) return null;
  if (nodePorts instanceof Map) return nodePorts.get(id) ?? null;
  return nodePorts[id] ?? null;
}

const InfiniteCanvas = forwardRef(function InfiniteCanvas(
  {
    stateKey,
    canvasState,
    onCanvasStateCommit,
    getInitialNodePos,
    nodes: nodeDescriptors = [],
    nodePorts,
    renderNode,
    renderNodePort,
    edges: edgeInput = [],
    edgeTypes,
    defaultEdgeOptions,
    minZoom = 0.24,
    maxZoom = 1.35,
    fitViewOptions,
    miniMap = false,
    controls = false,
    background = DEFAULT_BACKGROUND,
    overlay = null,
    panOnScroll = true,
    selectionOnDrag = true,
    proOptions = { hideAttribution: true },
    className,
    viewportClassName,
    onViewportChange,
  },
  ref,
) {
  const [instance, setInstance] = useState(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [isReady, setIsReady] = useState(false);

  // Latest-value refs so effects can read current props without re-subscribing.
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const nodePortsRef = useRef(nodePorts);
  nodePortsRef.current = nodePorts;
  const nodeDescriptorsRef = useRef(nodeDescriptors);
  nodeDescriptorsRef.current = nodeDescriptors;
  const renderNodeRef = useRef(renderNode);
  renderNodeRef.current = renderNode;
  const renderNodePortRef = useRef(renderNodePort);
  renderNodePortRef.current = renderNodePort;
  const getInitialNodePosRef = useRef(getInitialNodePos);
  getInitialNodePosRef.current = getInitialNodePos;
  const onCommitRef = useRef(onCanvasStateCommit);
  onCommitRef.current = onCanvasStateCommit;
  const rfNodesRef = useRef(rfNodes);
  rfNodesRef.current = rfNodes;

  const committedBlobRef = useRef(normalizeBlob(canvasState));
  const viewportRef = useRef(canvasState?.viewport ?? null);
  const hasInitializedViewportRef = useRef(false);

  const resolvePlacement = useCallback((descriptor, index, placed) => {
    const seeded = committedBlobRef.current?.nodes?.[descriptor.id];
    if (seeded && Number.isFinite(seeded.x) && Number.isFinite(seeded.y)) {
      return { position: { x: seeded.x, y: seeded.y }, fromInitial: false };
    }
    const initial = getInitialNodePosRef.current?.(descriptor, {
      index,
      nodeCount: nodeDescriptorsRef.current.length,
      nodes: nodeDescriptorsRef.current,
      placed,
    });
    if (initial && Number.isFinite(initial.x) && Number.isFinite(initial.y)) {
      return { position: { x: initial.x, y: initial.y }, fromInitial: true };
    }
    return { position: { x: 0, y: 0 }, fromInitial: true };
  }, []);

  const buildData = useCallback((descriptor) => ({
    __node: descriptor,
    __ports: readPorts(nodePortsRef.current, descriptor.id),
    __renderNode: renderNodeRef.current,
    __renderNodePort: renderNodePortRef.current,
  }), []);

  const makeNode = useCallback((descriptor, position) => {
    const width = descriptor.width;
    return {
      id: descriptor.id,
      type: CANVAS_FRAME_TYPE,
      position,
      draggable: true,
      style: Number.isFinite(width) ? { width } : undefined,
      data: buildData(descriptor),
    };
  }, [buildData]);

  const buildBlob = useCallback(() => {
    const nodesBlob = {};
    for (const node of rfNodesRef.current) {
      nodesBlob[node.id] = { x: node.position.x, y: node.position.y };
    }
    return {
      v: 1,
      viewport: viewportRef.current ?? committedBlobRef.current?.viewport ?? null,
      nodes: nodesBlob,
    };
  }, []);

  const commitGeometry = useCallback(() => {
    const blob = buildBlob();
    if (deepEqualView(blob, committedBlobRef.current)) return;
    committedBlobRef.current = blob;
    onCommitRef.current?.(blob);
  }, [buildBlob]);

  // Seed (and re-seed on stateKey change). Owns initial placement + viewport reset.
  useEffect(() => {
    committedBlobRef.current = normalizeBlob(canvasStateRef.current);
    viewportRef.current = canvasStateRef.current?.viewport ?? null;
    hasInitializedViewportRef.current = false;
    setIsReady(false);

    const placed = {};
    const seeded = nodeDescriptorsRef.current.map((descriptor, index) => {
      const { position } = resolvePlacement(descriptor, index, placed);
      placed[descriptor.id] = position;
      return makeNode(descriptor, position);
    });
    setRfNodes(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  // Reconcile descriptors / ports / width into ReactFlow node state, preserving
  // live drag positions for existing nodes and lazily placing new ones.
  useEffect(() => {
    setRfNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const placed = {};
      let changed = current.length !== nodeDescriptors.length;

      const next = nodeDescriptors.map((descriptor, index) => {
        const existing = currentById.get(descriptor.id);
        const position = existing
          ? existing.position
          : resolvePlacement(descriptor, index, placed).position;
        placed[descriptor.id] = position;

        const width = descriptor.width;
        const ports = readPorts(nodePorts, descriptor.id);

        if (
          existing
          && existing.position === position
          && existing.style?.width === width
          && deepEqualView(existing.data.__node, descriptor)
          && deepEqualView(existing.data.__ports, ports)
          && existing.data.__renderNode === renderNode
          && existing.data.__renderNodePort === renderNodePort
        ) {
          return existing;
        }

        changed = true;
        return {
          ...(existing ?? {}),
          id: descriptor.id,
          type: CANVAS_FRAME_TYPE,
          position,
          draggable: true,
          style: Number.isFinite(width) ? { width } : undefined,
          data: {
            __node: descriptor,
            __ports: ports,
            __renderNode: renderNode,
            __renderNodePort: renderNodePort,
          },
        };
      });

      return changed ? next : current;
    });
  }, [nodeDescriptors, nodePorts, canvasState, renderNode, renderNodePort, resolvePlacement, setRfNodes]);

  // Edges are fully controlled by the consumer.
  useEffect(() => {
    setRfEdges(edgeInput);
  }, [edgeInput, setRfEdges]);

  // Persist geometry as soon as a node is placed via getInitialNodePos (i.e. it
  // has no entry in the committed blob yet) — no need to wait for a drag.
  useEffect(() => {
    if (rfNodes.length === 0) return;
    const committedNodes = committedBlobRef.current?.nodes ?? {};
    if (rfNodes.some((node) => !committedNodes[node.id])) {
      commitGeometry();
    }
  }, [rfNodes, commitGeometry]);

  // Viewport lifecycle: restore the persisted viewport or fit-to-view once,
  // keeping the surface hidden until the first view is applied.
  useEffect(() => {
    if (!instance || rfNodes.length === 0 || hasInitializedViewportRef.current) {
      return undefined;
    }
    hasInitializedViewportRef.current = true;
    const seedViewport = committedBlobRef.current?.viewport ?? null;

    const frame = window.requestAnimationFrame(() => {
      if (seedViewport) {
        instance.setViewport(seedViewport, { duration: 0 });
        viewportRef.current = seedViewport;
      } else {
        instance.fitView({ duration: 0, padding: 0.18, minZoom: 0.35, maxZoom: 1.08, ...fitViewOptions });
        viewportRef.current = instance.getViewport?.() ?? null;
      }
      setIsReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [instance, rfNodes.length, fitViewOptions]);

  const handleMoveEnd = useCallback(() => {
    viewportRef.current = instance?.getViewport?.() ?? viewportRef.current;
    onViewportChange?.(viewportRef.current);
    commitGeometry();
  }, [commitGeometry, instance, onViewportChange]);

  const handleNodeDragStop = useCallback(() => {
    const frame = window.requestAnimationFrame(() => commitGeometry());
    return () => window.cancelAnimationFrame(frame);
  }, [commitGeometry]);

  useImperativeHandle(ref, () => ({
    fitView: (opts) => instance?.fitView?.(opts),
    setViewport: (viewport, opts) => instance?.setViewport?.(viewport, opts),
    setCenter: (x, y, opts) => instance?.setCenter?.(x, y, opts),
    getViewport: () => instance?.getViewport?.(),
    getNode: (id) => instance?.getNode?.(id),
    instance,
  }), [instance]);

  return (
    <div className={viewportClassName}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        minZoom={minZoom}
        maxZoom={maxZoom}
        proOptions={proOptions}
        className={className}
        style={isReady ? undefined : { visibility: 'hidden' }}
        panOnScroll={panOnScroll}
        selectionOnDrag={selectionOnDrag}
        onInit={setInstance}
        onMoveEnd={handleMoveEnd}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onEdgesChange={onEdgesChange}
      >
        {overlay}
        {miniMap ? <MiniMap pannable zoomable {...(typeof miniMap === 'object' ? miniMap : null)} /> : null}
        {controls ? <Controls showInteractive={false} {...(typeof controls === 'object' ? controls : null)} /> : null}
        {background ? <Background {...background} /> : null}
      </ReactFlow>
    </div>
  );
});

export { InfiniteCanvas };
export default InfiniteCanvas;
