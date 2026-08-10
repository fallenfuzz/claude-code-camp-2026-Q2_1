import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  type Snapshot,
} from "../contracts";
import type { LiveRouteIdentity } from "../routes";
import {
  buildMapGraph,
  canonicalNodeId,
  mapRoomHeight,
  mapRoomWidth,
  type MapConnection,
  type MapGraph,
  type MapPoint,
} from "./mapModel";
import {
  fitMapCameraToSafeFrame,
  isContinuousMapTransition,
  keepSelectedRoomOutsidePanel,
  mapCameraViewport,
  mapOverlaySafeBand,
  mapContentExtent,
  panMapCamera,
  resolveFollowMapCameraAnchor,
  roomCenter,
  stepCriticallyDampedMapCenter,
  viewportCenter,
  zoomMapCamera,
  type MapCameraView,
  type MapSafeInsets,
} from "./mapCamera";
import { LiveMapAgent } from "./LiveMapAgent";
import { mapBentPath, mapRoomEdge } from "./mapDrawing";
import { LiveMapFrontier } from "./LiveMapFrontier";
import { LiveMapFloorFeatures } from "./LiveMapFloorFeatures";
import {
  floorSwapMilliseconds,
  floorWarpHoldMilliseconds,
  floorWarpLegMilliseconds,
  floorWarpMilliseconds,
  LiveMapFloorWarp,
  type FloorWarpDrawing,
  type FloorWarpPhase,
} from "./LiveMapFloorWarp";
import { LiveMapGhosts } from "./LiveMapGhosts";
import { LiveMapLegend } from "./LiveMapLegend";
import { LiveMapRoom } from "./LiveMapRoom";
import { LiveMapToolbar } from "./LiveMapToolbar";
import { LiveRoomInspector } from "./LiveRoomInspector";
import { LiveThoughtDock } from "./LiveThoughtDock";
import { LiveCombatPanel } from "./LiveCombatPanel";
import type { LiveSnapshotState } from "./useLiveSnapshot";
import { projectMapLegend } from "./mapLegend";
import { projectMapEvidence } from "./markerProjection";
import {
  automaticMapMode,
  maximumMapZoom,
  minimumMapZoom,
  projectLanternOpacities,
  projectMapPresentation,
  type MapCameraMode,
  type MapMode,
  type MapOverlayRect,
} from "./mapPresentation";
import { mapRoomFootprint } from "./mapRoomFootprint";
import { projectMapFloorFeatures } from "./mapFloorProjection";
import { projectMapGhosts } from "./mapGhostProjection";
import { projectMapConnections } from "./mapConnectionPresentation";
import { emptyRoomLayout } from "./roomLayout";
import { useRoomLayout } from "./useRoomLayout";
import { useAtlasZone } from "./useAtlasZone";
import {
  projectRoomInspector,
  type RoomInspectorProjection,
} from "./roomInspector";
import {
  selectedRoomFromLocation,
  syncSelectedRoomToLocation,
} from "./selectionUrl";

type Props = {
  controls?: "full" | "session";
  identity: LiveRouteIdentity;
  snapshot: Snapshot | null;
  state: LiveSnapshotState;
};

const defaultFrame = { width: 1_600, height: 900 };
const sessionInitialMapScale = 0.8;
const defaultSafeInsets: MapSafeInsets = {
  top: 8,
  right: 8,
  bottom: 8,
  left: 8,
};
const overlayExpandedByDefault = () => {
  return typeof window === "undefined" || window.innerWidth > 700;
};

type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  center: MapPoint;
  moved: boolean;
};

type FloorWarpState = FloorWarpDrawing & {
  id: string;
  targetGraph: MapGraph;
};

export function LiveMap({
  controls = "full",
  identity,
  snapshot,
  state,
}: Props) {
  const initialMapScale = controls === "session"
    ? sessionInitialMapScale
    : 1;
  const [frame, setFrame] = useState(defaultFrame);
  const [cameraView, setCameraView] = useState<MapCameraView>({
    center: { x: 0, y: 0 },
    scale: initialMapScale,
  });
  const [cameraMode, setCameraMode] = useState<MapCameraMode>("follow");
  const [chosenMode, setChosenMode] = useState<MapMode | null>(
    controls === "session" ? "grow" : null,
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    selectedRoomFromLocation,
  );
  const [thoughtExpanded, setThoughtExpanded] = useState(
    overlayExpandedByDefault,
  );
  const [legendExpanded, setLegendExpanded] = useState(
    controls === "session",
  );
  const [ghostsVisible, setGhostsVisible] = useState(true);
  const [panHintVisible, setPanHintVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [arrivingRoomId, setArrivingRoomId] = useState<string | null>(null);
  const [floorWarp, setFloorWarp] = useState<FloorWarpState | null>(null);
  const [safeInsets, setSafeInsets] = useState(defaultSafeInsets);
  const [focusOverlayRects, setFocusOverlayRects] = useState<MapOverlayRect[]>(
    [],
  );
  const [markerOverlayRects, setMarkerOverlayRects] = useState<MapOverlayRect[]>(
    [],
  );
  const stageRef = useRef<HTMLElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const cameraViewRef = useRef(cameraView);
  const followVelocityRef = useRef<MapPoint>({ x: 0, y: 0 });
  const followAnchorRef = useRef<MapPoint | null>(null);
  const followInitializedRef = useRef(false);
  const previousCurrentRoomIdRef = useRef<string | null>(null);
  const agentCenterRef = useRef<MapPoint | null>(null);
  const agentDestinationRoomRef = useRef<string | null>(null);
  const previousFloorRef = useRef<string | null>(null);

  const loadedWorld = useRoomLayout();
  const world = loadedWorld ?? emptyRoomLayout;
  const observedGraph = useMemo(() => {
    if (world.rooms === 0) return buildMapGraph([], [], world);
    const nodes = snapshot?.world.nodes ?? [];
    const edges = snapshot?.world.edges ?? [];
    return buildMapGraph(nodes, edges, world);
  }, [snapshot, world]);
  const [graph, setGraph] = useState(observedGraph);
  const evidenceMarkers = useMemo(() => {
    return projectMapEvidence(
      snapshot?.world.nodes ?? [],
      snapshot?.world.edges ?? [],
      snapshot?.world.frontier ?? [],
      graph.rooms,
    );
  }, [graph.rooms, snapshot]);
  const mode = automaticMapMode(graph.rooms.length, chosenMode);
  const currentCenter = roomCenter(graph, graph.currentRoomId) ?? {
    x: graph.x + graph.width / 2,
    y: graph.y + graph.height / 2,
  };
  const presentation = useMemo(() => {
    return projectMapPresentation(graph, mode, selectedRoomId);
  }, [graph, mode, selectedRoomId]);
  const agentPoint = useMemo(() => {
    return graph.rooms.find(({ node }) => {
      return node.id === graph.currentRoomId;
    })?.point ?? null;
  }, [graph.currentRoomId, graph.rooms]);
  agentDestinationRoomRef.current = graph.currentRoomId;
  const atlasNodes = useAtlasZone(graph.floor?.zone ?? null);
  const visitedVnums = useMemo(() => {
    return new Set(graph.rooms.flatMap(({ node }) => {
      const vnum = node.atlas?.vnum;
      return vnum === undefined || vnum === null ? [] : [vnum];
    }));
  }, [graph.rooms]);
  const gameProjection = useMemo(() => {
    if (graph.floor === null) {
      return { links: [], rooms: [] };
    }
    return projectMapGhosts({
      atlasNodes,
      floor: world.floor(graph.floor.zone, graph.floor.level),
      layout: world,
      visitedVnums,
    });
  }, [atlasNodes, graph.floor, visitedVnums, world]);
  const ghostProjection = ghostsVisible
    ? gameProjection
    : { links: [], rooms: [] };
  const displayConnections = useMemo(() => projectMapConnections(
    graph.connections,
    graph.rooms,
    gameProjection.links,
  ), [gameProjection.links, graph.connections, graph.rooms]);
  // The room it came from, kept only while the step is worth animating: a
  // move to somewhere already on this fixed floor, not the first room of a
  // session and not a cross-floor transition.
  const walkedFromRef = useRef<MapPoint | null>(null);
  const lastAgentRoomRef = useRef<string | null>(null);
  const lastAgentPointRef = useRef<MapPoint | null>(null);
  if (graph.currentRoomId !== lastAgentRoomRef.current) {
    const previousRoomId = lastAgentRoomRef.current;
    const planarStep = previousRoomId !== null && displayConnections.some(
      (connection) => (
        !connection.vertical
        && (
          connection.source === previousRoomId
          && connection.target === graph.currentRoomId
          || connection.target === previousRoomId
          && connection.source === graph.currentRoomId
        )
      ),
    );
    walkedFromRef.current = planarStep ? lastAgentPointRef.current : null;
    lastAgentRoomRef.current = graph.currentRoomId;
    lastAgentPointRef.current = agentPoint;
  }
  const walkedFrom = walkedFromRef.current;
  const visibleFrontiers = ghostsVisible ? [] : evidenceMarkers.frontiers;
  const floorFeatures = useMemo(() => projectMapFloorFeatures({
    nodes: snapshot?.world.nodes ?? [],
    edges: snapshot?.world.edges ?? [],
    rooms: graph.rooms,
    verticalByRoom: evidenceMarkers.verticalByRoom,
    layout: world,
    gameLinks: gameProjection.links,
  }), [
    evidenceMarkers.verticalByRoom,
    gameProjection.links,
    graph.rooms,
    snapshot,
    world,
  ]);
  const observedFloorFeatures = useMemo(() => {
    const observedEvidence = projectMapEvidence(
      snapshot?.world.nodes ?? [],
      snapshot?.world.edges ?? [],
      snapshot?.world.frontier ?? [],
      observedGraph.rooms,
    );
    return projectMapFloorFeatures({
      nodes: snapshot?.world.nodes ?? [],
      edges: snapshot?.world.edges ?? [],
      rooms: observedGraph.rooms,
      verticalByRoom: observedEvidence.verticalByRoom,
      layout: world,
    });
  }, [observedGraph, snapshot, world]);
  const lanternOpacities = useMemo(() => {
    return projectLanternOpacities(graph);
  }, [graph]);
  const markerPoints = useMemo(() => {
    return [
      ...visibleFrontiers.map(({ source, end }) => ({
        source,
        point: end,
      })),
      ...floorFeatures.stairs.map((stair) => ({
        source: stair.source,
        point: stair.disc,
      })),
      ...floorFeatures.holes.flatMap((hole) => hole.ways.map((way) => ({
        source: hole.id,
        point: way.anchor,
      }))),
    ];
  }, [floorFeatures, visibleFrontiers]);
  const completeRoomIds = useMemo(() => {
    return new Set(graph.rooms.map(({ node }) => node.id));
  }, [graph.rooms]);
  const completeExtent = useMemo(() => {
    return mapContentExtent(graph, completeRoomIds, markerPoints);
  }, [completeRoomIds, graph, markerPoints]);
  const activeExtent = useMemo(() => {
    return mapContentExtent(
      graph,
      presentation.visibleRoomIds,
      markerPoints,
    );
  }, [graph, markerPoints, presentation.visibleRoomIds]);
  const fitExtent = useMemo(() => {
    if (
      selectedRoomId === null
      || presentation.selectionPathRoomIds.length === 0
    ) {
      return activeExtent;
    }
    return mapContentExtent(
      graph,
      new Set(presentation.selectionPathRoomIds),
      markerPoints,
    );
  }, [
    activeExtent,
    graph,
    markerPoints,
    presentation.selectionPathRoomIds,
    selectedRoomId,
  ]);
  const beaconRoomIds = useMemo(() => {
    const rawNodes = new Map(
      (snapshot?.world.nodes ?? []).map((node) => [node.id, node]),
    );
    return new Set(
      (snapshot?.world.objective_beacons ?? []).flatMap((beacon) => {
        const node = rawNodes.get(beacon.node_id);
        return node === undefined ? [] : [canonicalNodeId(node)];
      }),
    );
  }, [snapshot]);
  const selectedMapRoom = useMemo(() => {
    return graph.rooms.find(({ node }) => node.id === selectedRoomId) ?? null;
  }, [graph.rooms, selectedRoomId]);
  const inspector = useMemo<RoomInspectorProjection | null>(() => {
    if (selectedMapRoom === null || snapshot === null) return null;
    return projectRoomInspector(
      selectedMapRoom.node,
      snapshot.world.nodes,
      snapshot.world.frontier,
      snapshot.room_economics,
    );
  }, [selectedMapRoom, snapshot]);
  const baseViewport = mapCameraViewport(cameraView, frame);
  const panelInset = frame.width <= 700
    ? { right: 0, bottom: Math.min(frame.height * 0.55, 420) + 14 }
    : { right: 318, bottom: 0 };
  const projectedViewport = keepSelectedRoomOutsidePanel(
    baseViewport,
    frame,
    selectedMapRoom?.point ?? null,
    inspector === null
      ? { right: 0, bottom: 0 }
      : {
        right: panelInset.right,
        bottom: panelInset.bottom,
      },
  );
  const visibleRoomFootprints = useMemo(() => {
    return graph.rooms.flatMap(({ node, point }) => {
      return presentation.visibleRoomIds.has(node.id)
        ? [mapRoomFootprint(node, point, node.id === graph.currentRoomId)]
        : [];
    });
  }, [
    graph.currentRoomId,
    graph.rooms,
    presentation.visibleRoomIds,
  ]);
  const legendEntries = useMemo(() => {
    return projectMapLegend({
      rooms: graph.rooms.map(({ node }) => node),
      visibleRoomIds: presentation.visibleRoomIds,
      currentRoomId: graph.currentRoomId,
      selectedRoomId,
      combat: Boolean(snapshot?.combat),
      beaconRoomIds,
      evidence: evidenceMarkers,
    });
  }, [
    beaconRoomIds,
    evidenceMarkers,
    graph.currentRoomId,
    graph.rooms,
    presentation.visibleRoomIds,
    selectedRoomId,
    snapshot?.combat,
  ]);
  const overlayBand = mapOverlaySafeBand({
    thoughtVisible: snapshot?.agent_thought !== null
      && snapshot?.agent_thought !== undefined,
    thoughtExpanded,
    legendExpanded,
    legendEntries: legendEntries.length,
  });
  const handleSelectRoom = useCallback((nodeId: string) => {
    setSelectedRoomId((current) => {
      const next = current === nodeId ? null : nodeId;
      syncSelectedRoomToLocation(next);
      return next;
    });
  }, []);
  const closeSelectedRoom = useCallback(() => {
    setSelectedRoomId(null);
    syncSelectedRoomToLocation(null);
  }, []);
  const trackAgentPosition = useCallback((point: MapPoint) => {
    agentCenterRef.current = point;
  }, []);
  const showAgentArrival = useCallback(() => {
    const roomId = agentDestinationRoomRef.current;
    if (roomId === null) return;
    setArrivingRoomId(roomId);
    window.setTimeout(() => {
      setArrivingRoomId((current) => current === roomId ? null : current);
    }, 360);
  }, []);
  useEffect(() => {
    if (floorWarp !== null || graph === observedGraph) return;
    const leavingFloor = floorKey(graph);
    const arrivingFloor = floorKey(observedGraph);
    if (
      leavingFloor === null
      || arrivingFloor === null
      || leavingFloor === arrivingFloor
    ) {
      setGraph(observedGraph);
      return;
    }
    const leavingRoomId = graph.currentRoomId;
    const arrivingRoomId = observedGraph.currentRoomId;
    if (leavingRoomId === null || arrivingRoomId === null) {
      setGraph(observedGraph);
      return;
    }
    const leavingVnum = graph.rooms.find(({ node }) => (
      node.id === leavingRoomId
    ))?.node.atlas?.vnum;
    const arrivingVnum = observedGraph.rooms.find(({ node }) => (
      node.id === arrivingRoomId
    ))?.node.atlas?.vnum;
    const leavingStair = floorFeatures.stairs.find((stair) => (
      stair.source === leavingRoomId
      && (arrivingVnum === undefined || stair.targetVnum === arrivingVnum)
    ));
    const arrivingStair = observedFloorFeatures.stairs.find((stair) => (
      stair.source === arrivingRoomId
      && (leavingVnum === undefined || stair.targetVnum === leavingVnum)
    ));
    const leavingRoom = roomCenter(graph, leavingRoomId);
    const arrivingRoom = roomCenter(observedGraph, arrivingRoomId);
    if (
      leavingStair === undefined
      || arrivingStair === undefined
      || leavingRoom === null
      || arrivingRoom === null
    ) {
      setGraph(observedGraph);
      return;
    }
    setFloorWarp({
      id: `${leavingFloor}:${leavingRoomId}:${arrivingFloor}:${arrivingRoomId}`,
      phase: "walk-out",
      phaseStarted: performance.now(),
      direction: leavingStair.way,
      leavingRoom,
      leavingDisc: leavingStair.disc,
      arrivingDisc: arrivingStair.disc,
      arrivingRoom,
      targetGraph: observedGraph,
    });
  }, [
    floorFeatures.stairs,
    floorWarp,
    graph,
    observedFloorFeatures.stairs,
    observedGraph,
    showAgentArrival,
  ]);
  const floorWarpId = floorWarp?.id ?? null;
  useEffect(() => {
    if (floorWarpId === null) return;
    const transition = floorWarp;
    if (transition === null || transition.phase !== "walk-out") return;
    const timers: number[] = [];
    const advance = (after: number, phase: FloorWarpPhase) => {
      timers.push(window.setTimeout(() => {
        setFloorWarp((current) => current?.id === floorWarpId
          ? { ...current, phase, phaseStarted: performance.now() }
          : current);
      }, after));
    };
    const warpOutAt = floorWarpLegMilliseconds;
    const leaveFloorAt = warpOutAt
      + floorWarpMilliseconds
      + floorWarpHoldMilliseconds;
    const swapFloorAt = leaveFloorAt + floorSwapMilliseconds;
    const walkInAt = swapFloorAt
      + floorWarpMilliseconds
      + floorWarpHoldMilliseconds;
    const completeAt = walkInAt + floorWarpLegMilliseconds;
    advance(warpOutAt, "warp-out");
    advance(leaveFloorAt, "floor-leaving");
    timers.push(window.setTimeout(() => {
      setGraph(transition.targetGraph);
      cameraViewRef.current = {
        center: transition.arrivingDisc,
        scale: cameraViewRef.current.scale,
      };
      setCameraView((current) => ({
        center: transition.arrivingDisc,
        scale: current.scale,
      }));
      setFloorWarp((current) => current?.id === floorWarpId
        ? { ...current, phase: "warp-in", phaseStarted: performance.now() }
        : current);
    }, swapFloorAt));
    advance(walkInAt, "walk-in");
    timers.push(window.setTimeout(() => {
      setFloorWarp((current) => current?.id === floorWarpId ? null : current);
      showAgentArrival();
    }, completeAt));
    return () => timers.forEach(window.clearTimeout);
  }, [floorWarpId, showAgentArrival]);
  useEffect(() => {
    const floor = graph.floor === null
      ? null
      : `${graph.floor.zone}:${graph.floor.level}`;
    const previous = previousFloorRef.current;
    previousFloorRef.current = floor;
    if (
      floorWarp === null
      && previous !== null
      && floor !== null
      && previous !== floor
    ) {
      showAgentArrival();
    }
  }, [floorWarp, graph.floor, showAgentArrival]);
  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  useEffect(() => {
    const currentRoomId = graph.currentRoomId;
    const previousRoomId = previousCurrentRoomIdRef.current;
    previousCurrentRoomIdRef.current = currentRoomId;
    if (cameraMode !== "follow" || currentRoomId === null) {
      followVelocityRef.current = { x: 0, y: 0 };
      followAnchorRef.current = null;
      return;
    }
    if (!followInitializedRef.current) {
      followInitializedRef.current = true;
      followVelocityRef.current = { x: 0, y: 0 };
      followAnchorRef.current = currentCenter;
      agentCenterRef.current = currentCenter;
      cameraViewRef.current = {
        center: currentCenter,
        scale: cameraViewRef.current.scale,
      };
      setCameraView((current) => ({
        center: currentCenter,
        scale: current.scale,
      }));
      return;
    }
    const start = cameraViewRef.current.center;
    const connectedMovement = isContinuousMapTransition(
      graph,
      previousRoomId,
      currentRoomId,
    );
    const target = connectedMovement
      ? resolveFollowMapCameraAnchor({
        center: followAnchorRef.current ?? cameraViewRef.current.center,
        scale: cameraViewRef.current.scale,
      }, agentCenterRef.current ?? currentCenter, frame).center
      : currentCenter;
    followAnchorRef.current = target;
    if (
      !connectedMovement
      &&
      Math.abs(start.x - target.x) < 0.01
      && Math.abs(start.y - target.y) < 0.01
    ) {
      followVelocityRef.current = { x: 0, y: 0 };
      return;
    }
    if (!connectedMovement) {
      followVelocityRef.current = { x: 0, y: 0 };
      followAnchorRef.current = target;
      cameraViewRef.current = {
        center: target,
        scale: cameraViewRef.current.scale,
      };
      setCameraView((current) => ({
        center: target,
        scale: current.scale,
      }));
      return;
    }
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches ?? false;
    if (reducedMotion || typeof requestAnimationFrame === "undefined") {
      followVelocityRef.current = { x: 0, y: 0 };
      followAnchorRef.current = target;
      cameraViewRef.current = {
        center: target,
        scale: cameraViewRef.current.scale,
      };
      setCameraView((current) => ({
        center: target,
        scale: current.scale,
      }));
      return;
    }
    followVelocityRef.current = {
      x: (target.x - start.x) * followVelocityRef.current.x < 0
        ? 0
        : followVelocityRef.current.x,
      y: (target.y - start.y) * followVelocityRef.current.y < 0
        ? 0
        : followVelocityRef.current.y,
    };
    let previousFrameAt = performance.now();
    let animationFrame = 0;
    const update = (now: number) => {
      const deltaSeconds = Math.min(
        Math.max((now - previousFrameAt) / 1_000, 0),
        0.1,
      );
      previousFrameAt = now;
      const movingTarget = resolveFollowMapCameraAnchor({
        center: followAnchorRef.current ?? cameraViewRef.current.center,
        scale: cameraViewRef.current.scale,
      }, agentCenterRef.current ?? currentCenter, frame).center;
      followAnchorRef.current = movingTarget;
      const motion = stepCriticallyDampedMapCenter({
        center: cameraViewRef.current.center,
        velocity: followVelocityRef.current,
      }, movingTarget, deltaSeconds);
      const settled = (
        Math.hypot(
          motion.center.x - movingTarget.x,
          motion.center.y - movingTarget.y,
        ) < 0.05
        && Math.hypot(motion.velocity.x, motion.velocity.y) < 0.05
      );
      const nextCenter = settled ? movingTarget : motion.center;
      followVelocityRef.current = settled
        ? { x: 0, y: 0 }
        : motion.velocity;
      cameraViewRef.current = {
        center: nextCenter,
        scale: cameraViewRef.current.scale,
      };
      setCameraView((current) => ({
        center: nextCenter,
        scale: current.scale,
      }));
      const agentAtDestination = Math.hypot(
        (agentCenterRef.current?.x ?? currentCenter.x) - currentCenter.x,
        (agentCenterRef.current?.y ?? currentCenter.y) - currentCenter.y,
      ) < 0.05;
      if (!settled || !agentAtDestination) {
        animationFrame = requestAnimationFrame(update);
      }
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    cameraMode,
    cameraView.scale,
    currentCenter.x,
    currentCenter.y,
    frame.height,
    frame.width,
    graph.connections,
    graph.currentRoomId,
    mode,
  ]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null || typeof ResizeObserver === "undefined") return;
    const updateGeometry = () => {
      const bounds = stage.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setFrame((current) => {
        if (
          Math.abs(current.width - bounds.width) < 1
          && Math.abs(current.height - bounds.height) < 1
        ) {
          return current;
        }
        return { width: bounds.width, height: bounds.height };
      });
      const focusOccluders = [...stage.querySelectorAll<HTMLElement>(
        "[data-map-focus-occluder]",
      )];
      const markerOccluders = [...stage.querySelectorAll<HTMLElement>(
        "[data-map-focus-occluder], [data-map-marker-occluder]",
      )];
      const nextInsets = { ...defaultSafeInsets };
      const projectOverlay = (overlay: HTMLElement): MapOverlayRect => {
        const overlayBounds = overlay.getBoundingClientRect();
        const left = Math.max(overlayBounds.left - bounds.left - 8, 0);
        const top = Math.max(overlayBounds.top - bounds.top - 8, 0);
        const right = Math.min(
          overlayBounds.right - bounds.left + 8,
          bounds.width,
        );
        const bottom = Math.min(
          overlayBounds.bottom - bounds.top + 8,
          bounds.height,
        );
        return {
          x: left,
          y: top,
          width: Math.max(right - left, 0),
          height: Math.max(bottom - top, 0),
        };
      };
      const nextFocusOverlayRects = focusOccluders.map(projectOverlay);
      const nextMarkerOverlayRects = markerOccluders.map(projectOverlay);
      for (const overlay of focusOccluders) {
        const overlayBounds = overlay.getBoundingClientRect();
        const edge = overlay.dataset.mapOverlayEdge;
        if (edge === "top") {
          nextInsets.top = Math.max(
            nextInsets.top,
            overlayBounds.bottom - bounds.top + 8,
          );
        } else if (edge === "right") {
          nextInsets.right = Math.max(
            nextInsets.right,
            bounds.right - overlayBounds.left + 8,
          );
        } else if (edge === "bottom") {
          nextInsets.bottom = Math.max(
            nextInsets.bottom,
            bounds.bottom - overlayBounds.top + 8,
          );
        } else if (edge === "left") {
          nextInsets.left = Math.max(
            nextInsets.left,
            overlayBounds.right - bounds.left + 8,
          );
        }
      }
      setFocusOverlayRects((current) => {
        return overlayRectsEqual(current, nextFocusOverlayRects)
          ? current
          : nextFocusOverlayRects;
      });
      setMarkerOverlayRects((current) => {
        return overlayRectsEqual(current, nextMarkerOverlayRects)
          ? current
          : nextMarkerOverlayRects;
      });
      setSafeInsets((current) => {
        if (
          Math.abs(current.top - nextInsets.top) < 1
          && Math.abs(current.right - nextInsets.right) < 1
          && Math.abs(current.bottom - nextInsets.bottom) < 1
          && Math.abs(current.left - nextInsets.left) < 1
        ) {
          return current;
        }
        return nextInsets;
      });
    };
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(stage);
    for (const overlay of stage.querySelectorAll<HTMLElement>(
      "[data-map-focus-occluder], [data-map-marker-occluder]",
    )) {
      observer.observe(overlay);
    }
    updateGeometry();
    return () => observer.disconnect();
  }, [
    graph.rooms.length,
    inspector,
    legendEntries.length,
    legendExpanded,
    mode,
    snapshot?.agent_thought,
    thoughtExpanded,
  ]);

  useEffect(() => {
    setCameraView({
      center: { x: 0, y: 0 },
      scale: initialMapScale,
    });
    followVelocityRef.current = { x: 0, y: 0 };
    followAnchorRef.current = null;
    followInitializedRef.current = false;
    previousCurrentRoomIdRef.current = null;
    agentCenterRef.current = null;
    previousFloorRef.current = null;
    setArrivingRoomId(null);
    setFloorWarp(null);
    setGraph(observedGraph);
    setSafeInsets(defaultSafeInsets);
    setFocusOverlayRects([]);
    setMarkerOverlayRects([]);
    setCameraMode("follow");
    setChosenMode(controls === "session" ? "grow" : null);
    setSelectedRoomId(selectedRoomFromLocation());
    setThoughtExpanded(overlayExpandedByDefault());
    setLegendExpanded(controls === "session");
    setPanHintVisible(true);
  }, [controls, identity.sessionId, initialMapScale]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedRoomId !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeSelectedRoom();
        return;
      }
      if (document.querySelector('[role="dialog"]') !== null) return;
      if (!legendExpanded) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLegendExpanded(false);
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      if (selectedRoomId === null) return;
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest(".live-room-inspector") !== null
        || event.target.closest(".live-map-room") !== null
        || event.target.closest(".live-map-dock") !== null
        || event.target.closest(".live-map-toolbar") !== null
      ) {
        return;
      }
      closeSelectedRoom();
    };
    window.addEventListener("keydown", handleEscape, { capture: true });
    document.addEventListener("pointerdown", handleOutsidePointer, {
      capture: true,
    });
    return () => {
      window.removeEventListener("keydown", handleEscape, { capture: true });
      document.removeEventListener("pointerdown", handleOutsidePointer, {
        capture: true,
      });
    };
  }, [closeSelectedRoom, legendExpanded, selectedRoomId]);

  if (snapshot === null) {
    return (
      <div className="live-map-message" role="status">
        {state === "reconnecting"
          ? "World evidence is reconnecting."
          : "Loading learned world…"}
      </div>
    );
  }

  if (graph.rooms.length === 0) {
    return (
      <div className="live-map-message" role="status">
        {loadedWorld === null
          ? "Loading the fixed world map…"
          : world.rooms === 0
            ? "Fixed world map unavailable."
            : "Waiting for the first observed room."}
      </div>
    );
  }

  const roomById = new Map(
    graph.rooms.map((room) => [room.node.id, room.point]),
  );
  const effectiveCameraView = cameraView;
  const camera = {
    viewport: projectedViewport,
    panning: mode !== "lantern",
  };
  const viewport = projectedViewport;
  const currentPoint = graph.currentRoomId === null
    ? undefined
    : roomById.get(graph.currentRoomId);
  const roomOpacity = (roomId: string): number => {
    if (
      mode !== "lantern"
      || roomId === graph.currentRoomId
      || roomId === selectedRoomId
    ) {
      return 1;
    }
    return lanternOpacities.get(roomId) ?? 0.12;
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      center: viewportCenter(viewport),
      moved: false,
    };
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (
      drag === null
      || drag.pointerId !== event.pointerId
      || svg === null
    ) {
      return;
    }
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      setPanHintVisible(false);
      if (mode === "lantern") setChosenMode("grow");
      setCameraMode("manual");
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      drag.center = viewportCenter(viewport);
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const panned = panMapCamera({
      center: drag.center,
      scale: effectiveCameraView.scale,
    }, {
      x: deltaX,
      y: deltaY,
    }, {
      x: viewport.width / bounds.width,
      y: viewport.height / bounds.height,
    });
    cameraViewRef.current = panned;
    setCameraView(panned);
  };
  const stopDragging = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleMapClickCapture = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const handleCameraChange = (next: MapCameraMode) => {
    followVelocityRef.current = { x: 0, y: 0 };
    followAnchorRef.current = next === "follow"
      ? viewportCenter(viewport)
      : null;
    if (mode === "lantern" && next !== "follow") {
      setChosenMode("grow");
    }
    if (next === "fit") {
      setCameraView(fitMapCameraToSafeFrame(
        fitExtent,
        frame,
        safeInsets,
      ));
    } else {
      setCameraView((current) => ({
        center: viewportCenter(viewport),
        scale: current.scale,
      }));
    }
    setCameraMode(next);
  };
  const handleModeChange = (next: MapMode) => {
    if (next === "lantern") {
      followInitializedRef.current = true;
      followVelocityRef.current = { x: 0, y: 0 };
      followAnchorRef.current = currentCenter;
      setCameraView((current) => ({
        center: currentCenter,
        scale: current.scale,
      }));
      setCameraMode("follow");
    }
    setChosenMode(next);
  };
  const handleZoom = (direction: "in" | "out") => {
    setCameraView((current) => {
      return zoomMapCamera({
        center: viewportCenter(viewport),
        scale: current.scale,
      }, direction);
    });
  };
  return (
    <section
      ref={stageRef}
      className={[
        "live-map-stage",
        mode === "lantern" ? "is-lantern" : "",
        inspector === null ? "" : "has-inspector",
      ].filter(Boolean).join(" ")}
      aria-label="Learned world map"
      style={{
        "--live-map-overlay-safe-band": `${overlayBand}px`,
      } as CSSProperties}
    >
      <LiveMapToolbar
        camera={cameraMode}
        mode={mode}
        variant={controls}
        selectedRoomId={selectedRoomId}
        zoom={effectiveCameraView.scale}
        minimumZoom={minimumMapZoom}
        maximumZoom={maximumMapZoom}
        onCameraChange={handleCameraChange}
        ghosts={ghostsVisible}
        onGhostsChange={setGhostsVisible}
        onModeChange={handleModeChange}
        onZoom={handleZoom}
      />
      <svg
        className={[
          "live-map",
          camera.panning ? "is-pannable" : "",
          dragging ? "is-dragging" : "",
        ].filter(Boolean).join(" ")}
        ref={svgRef}
        role="img"
        aria-label={`Learned world, ${graph.rooms.length} rooms`}
        style={{
          height: "100%",
        }}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onClickCapture={handleMapClickCapture}
        onDragStart={(event) => event.preventDefault()}
      >
        <defs>
          <marker
            id="live-map-one-way-tip"
            markerHeight="7"
            markerUnits="userSpaceOnUse"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path className="live-map-one-way-tip" d="M0 0 L6 3 L0 6 z" />
          </marker>
          <marker
            id="live-map-one-way-tip-walked"
            markerHeight="7"
            markerUnits="userSpaceOnUse"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path className="live-map-one-way-tip-walked" d="M0 0 L6 3 L0 6 z" />
          </marker>
          <radialGradient id="live-current-room-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4fd6c9" stopOpacity=".55" />
            <stop offset="100%" stopColor="#4fd6c9" stopOpacity="0" />
          </radialGradient>
          {mode === "lantern" && currentPoint !== undefined ? (
            <radialGradient
              id="live-map-lantern-gradient"
              cx={currentPoint.x + mapRoomWidth / 2}
              cy={currentPoint.y + mapRoomHeight / 2}
              gradientUnits="userSpaceOnUse"
              r="280"
            >
              <stop
                className="live-map-lantern-center"
                offset="0%"
              />
              <stop
                className="live-map-lantern-edge"
                offset="100%"
              />
            </radialGradient>
          ) : null}
        </defs>
        <g className={floorPlaneClass(floorWarp)}>
          {mode === "lantern" && currentPoint !== undefined ? (
            <rect
              className="live-map-lantern-field"
              fill="url(#live-map-lantern-gradient)"
              height={viewport.height}
              pointerEvents="none"
              width={viewport.width}
              x={viewport.x}
              y={viewport.y}
            />
          ) : null}
          <LiveMapGhosts {...ghostProjection} />
          <g className="live-map-connections">
          {displayConnections.flatMap((connection) => {
            if (!presentation.visibleConnectionIds.has(connection.id)) {
              return [];
            }
            return [(
              <MapLink
                key={connection.id}
                connection={connection}
                source={roomById.get(connection.source)}
                target={roomById.get(connection.target)}
                opacity={Math.max(
                  roomOpacity(connection.source),
                  roomOpacity(connection.target),
                )}
              />
            )];
          })}
          </g>
          <g className="live-map-frontiers">
          {visibleFrontiers.flatMap((marker) => {
            if (!presentation.visibleRoomIds.has(marker.source)) return [];
            return [(
              <g key={marker.id} opacity={roomOpacity(marker.source)}>
                <LiveMapFrontier marker={marker} />
              </g>
            )];
          })}
          </g>
          <g className="live-map-rooms">
          {graph.rooms.flatMap(({ node, point }) => {
            if (!presentation.visibleRoomIds.has(node.id)) return [];
            return [(
              <g key={node.id} opacity={roomOpacity(node.id)}>
                <LiveMapRoom
                  node={node}
                  point={point}
                  current={node.id === graph.currentRoomId}
                  arriving={node.id === arrivingRoomId}
                  selected={node.id === selectedRoomId}
                  combat={Boolean(
                    snapshot.combat && node.id === graph.currentRoomId,
                  )}
                  beacon={beaconRoomIds.has(node.id)}
                  verticalMarkers={
                    []
                  }
                  onSelect={handleSelectRoom}
                />
              </g>
            )];
          })}
          </g>
          <LiveMapFloorFeatures {...floorFeatures} />
        </g>
        {floorWarp === null ? (
          <LiveMapAgent
            from={walkedFrom}
            to={agentPoint}
            onPosition={trackAgentPosition}
            onArrival={showAgentArrival}
          />
        ) : (
          <LiveMapFloorWarp
            drawing={floorWarp}
            onPosition={trackAgentPosition}
          />
        )}
      </svg>
      {inspector === null ? null : (
        <LiveRoomInspector
          room={inspector}
          onClose={closeSelectedRoom}
        />
      )}
      <LiveCombatPanel episode={snapshot.combat_episode} />
      <LiveThoughtDock
        expanded={thoughtExpanded}
        historical={controls === "session"}
        thought={snapshot.agent_thought}
        onToggle={() => setThoughtExpanded((current) => !current)}
      />
      <LiveMapLegend
        entries={legendEntries}
        expanded={legendExpanded}
        onToggle={() => setLegendExpanded((current) => !current)}
      />
      {camera.panning && panHintVisible ? (
        <p className="live-map-pan-hint">
          Drag to explore the learned world.
        </p>
      ) : null}
      {state === "reconnecting" ? (
        <p className="live-map-connection-state" role="status">
          Showing the latest world while evidence reconnects.
        </p>
      ) : null}
    </section>
  );
}

function MapLink({
  connection,
  opacity,
  source,
  target,
}: {
  connection: MapConnection;
  opacity: number;
  source: MapPoint | undefined;
  target: MapPoint | undefined;
}) {
  if (source === undefined || target === undefined) {
    return null;
  }
  const from = {
    x: source.x + mapRoomWidth / 2,
    y: source.y + mapRoomHeight / 2,
  };
  const to = {
    x: target.x + mapRoomWidth / 2,
    y: target.y + mapRoomHeight / 2,
  };
  // A link joins two rooms and stops where each begins. Drawn centre to
  // centre it runs under both of them, which reads as passing through.
  const start = mapRoomEdge(from, to);
  const end = mapRoomEdge(to, from);
  const path = connection.hop || connection.bent
    ? mapBentPath(start, end)
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const className = [
    "live-map-link",
    connection.hop || connection.bent ? "is-hop" : "",
    connection.walked ? "is-walked" : "is-faint",
    connection.displacement ? "is-displacement" : "",
    connection.vertical ? "is-vertical" : "",
  ].filter(Boolean).join(" ");
  return (
    <g className={className} opacity={opacity}>
      <path
        d={path}
        markerEnd={connection.oneWay
          ? connection.walked
            ? "url(#live-map-one-way-tip-walked)"
            : "url(#live-map-one-way-tip)"
          : undefined}
      />
    </g>
  );
}

function overlayRectsEqual(
  left: readonly MapOverlayRect[],
  right: readonly MapOverlayRect[],
): boolean {
  return left.length === right.length
    && left.every((rect, index) => {
      const candidate = right[index];
      return candidate !== undefined
        && Math.abs(rect.x - candidate.x) < 1
        && Math.abs(rect.y - candidate.y) < 1
        && Math.abs(rect.width - candidate.width) < 1
        && Math.abs(rect.height - candidate.height) < 1;
    });
}

function floorKey(graph: MapGraph): string | null {
  return graph.floor === null
    ? null
    : `${graph.floor.zone}:${graph.floor.level}`;
}

function floorPlaneClass(warp: FloorWarpState | null): string {
  if (warp?.phase === "floor-leaving") {
    return `live-map-plane is-leaving-${warp.direction}`;
  }
  if (warp?.phase === "warp-in") {
    return `live-map-plane is-entering-${warp.direction}`;
  }
  return "live-map-plane";
}
