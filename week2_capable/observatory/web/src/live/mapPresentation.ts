import type {
  MapConnection,
  MapGraph,
  MapViewport,
} from "./mapModel";
import type { MapFrame } from "./mapCamera";
import { mapRoomFootprint } from "./mapRoomFootprint";

export type MapMode = "grow" | "lantern";
export type MapCameraMode = "follow" | "manual" | "fit";

export type MapPresentation = {
  visibleRoomIds: ReadonlySet<string>;
  visibleConnectionIds: ReadonlySet<string>;
  selectionPathRoomIds: readonly string[];
};

export type MapOverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapCameraEvent =
  | "session-change"
  | "drag"
  | "follow"
  | "fit"
  | "room-select"
  | "zoom"
  | "snapshot";

export const minimumMapZoom = 0.1;
export const maximumMapZoom = 2;

export function automaticMapMode(
  _roomCount: number,
  chosenMode: MapMode | null,
): MapMode {
  return chosenMode ?? "grow";
}

export function transitionMapCamera(
  current: MapCameraMode,
  event: MapCameraEvent,
): MapCameraMode {
  if (event === "session-change" || event === "follow") return "follow";
  if (event === "drag") return "manual";
  if (event === "fit") return "fit";
  return current;
}

export function changeMapZoom(
  current: number,
  direction: "in" | "out",
): number {
  const next = direction === "in" ? current * 1.25 : current / 1.25;
  return clamp(next, minimumMapZoom, maximumMapZoom);
}

export function projectMapPresentation(
  graph: MapGraph,
  mode: MapMode,
  selectedRoomId: string | null,
): MapPresentation {
  const everyRoom = new Set(graph.rooms.map(({ node }) => node.id));
  const adjacency = buildAdjacency(graph.connections);
  const selectionPathRoomIds = selectedRoomId === null
    || graph.currentRoomId === null
    || !everyRoom.has(selectedRoomId)
    ? []
    : shortestPath(adjacency, graph.currentRoomId, selectedRoomId)
      ?? [selectedRoomId];
  return {
    visibleRoomIds: everyRoom,
    visibleConnectionIds: new Set(graph.connections.map(({ id }) => id)),
    selectionPathRoomIds,
  };
}

function pruneToCurrentComponent(
  adjacency: ReadonlyMap<string, Neighbor[]>,
  currentRoomId: string,
  visibleRoomIds: Set<string>,
): void {
  const component = new Set<string>();
  const queue = visibleRoomIds.has(currentRoomId) ? [currentRoomId] : [];
  while (queue.length > 0) {
    const roomId = queue.shift();
    if (roomId === undefined || component.has(roomId)) continue;
    component.add(roomId);
    for (const neighbor of adjacency.get(roomId) ?? []) {
      if (
        visibleRoomIds.has(neighbor.roomId)
        && !component.has(neighbor.roomId)
      ) {
        queue.push(neighbor.roomId);
      }
    }
  }
  for (const roomId of visibleRoomIds) {
    if (!component.has(roomId)) visibleRoomIds.delete(roomId);
  }
}

export function projectLanternOpacities(
  graph: MapGraph,
): ReadonlyMap<string, number> {
  if (graph.currentRoomId === null) {
    return new Map(graph.rooms.map(({ node }) => [node.id, 1]));
  }
  const distances = graphDistances(
    buildAdjacency(graph.connections),
    graph.currentRoomId,
  );
  return new Map(graph.rooms.map(({ node }) => {
    const distance = distances.get(node.id);
    if (distance === undefined) return [node.id, 0.12];
    if (distance === 0) return [node.id, 1];
    if (distance === 1) return [node.id, 0.8];
    if (distance === 2) return [node.id, 0.5];
    return [node.id, 0.12];
  }));
}

export function visibleRoomComponentSize(
  graph: MapGraph,
  visibleRoomIds: ReadonlySet<string>,
): number {
  if (
    graph.currentRoomId === null
    || !visibleRoomIds.has(graph.currentRoomId)
  ) {
    return 0;
  }
  const adjacency = buildAdjacency(graph.connections);
  const component = new Set<string>();
  const queue = [graph.currentRoomId];
  while (queue.length > 0) {
    const roomId = queue.shift();
    if (roomId === undefined || component.has(roomId)) continue;
    component.add(roomId);
    for (const neighbor of adjacency.get(roomId) ?? []) {
      if (
        visibleRoomIds.has(neighbor.roomId)
        && !component.has(neighbor.roomId)
      ) {
        queue.push(neighbor.roomId);
      }
    }
  }
  return component.size;
}

type Neighbor = {
  roomId: string;
  firstSequence: number;
  connectionId: string;
};

function buildAdjacency(
  connections: MapConnection[],
): Map<string, Neighbor[]> {
  const adjacency = new Map<string, Neighbor[]>();
  const add = (roomId: string, neighbor: Neighbor) => {
    const neighbors = adjacency.get(roomId) ?? [];
    neighbors.push(neighbor);
    adjacency.set(roomId, neighbors);
  };
  for (const connection of connections) {
    add(connection.source, {
      roomId: connection.target,
      firstSequence: connection.firstSequence,
      connectionId: connection.id,
    });
    add(connection.target, {
      roomId: connection.source,
      firstSequence: connection.firstSequence,
      connectionId: connection.id,
    });
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => {
      return left.firstSequence - right.firstSequence
        || left.connectionId.localeCompare(right.connectionId)
        || left.roomId.localeCompare(right.roomId);
    });
  }
  return adjacency;
}

function graphDistances(
  adjacency: Map<string, Neighbor[]>,
  source: string,
): Map<string, number> {
  const distances = new Map([[source, 0]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const distance = distances.get(current);
    if (distance === undefined) continue;
    for (const { roomId } of adjacency.get(current) ?? []) {
      if (distances.has(roomId)) continue;
      distances.set(roomId, distance + 1);
      queue.push(roomId);
    }
  }
  return distances;
}

function roomFitsFrame(
  room: MapOverlayRect,
  frame: MapFrame,
): boolean {
  return room.x >= 0
    && room.y >= 0
    && room.x + room.width <= frame.width
    && room.y + room.height <= frame.height;
}

function rectanglesIntersect(
  left: MapOverlayRect,
  right: MapOverlayRect,
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function shortestPath(
  adjacency: Map<string, Neighbor[]>,
  source: string,
  target: string,
): string[] | null {
  if (source === target) return [source];
  const previous = new Map<string, string | null>([[source, null]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const { roomId } of adjacency.get(current) ?? []) {
      if (previous.has(roomId)) continue;
      previous.set(roomId, current);
      if (roomId === target) {
        const path = [target];
        let cursor: string | null = current;
        while (cursor !== null) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(roomId);
    }
  }
  return null;
}

function shortestPathWithin(
  adjacency: ReadonlyMap<string, Neighbor[]>,
  source: string,
  target: string,
  allowedRoomIds: ReadonlySet<string>,
): string[] | null {
  if (!allowedRoomIds.has(source) || !allowedRoomIds.has(target)) return null;
  if (source === target) return [source];
  const previous = new Map<string, string | null>([[source, null]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const { roomId } of adjacency.get(current) ?? []) {
      if (!allowedRoomIds.has(roomId) || previous.has(roomId)) continue;
      previous.set(roomId, current);
      if (roomId !== target) {
        queue.push(roomId);
        continue;
      }
      const path = [target];
      let cursor: string | null = current;
      while (cursor !== null) {
        path.push(cursor);
        cursor = previous.get(cursor) ?? null;
      }
      return path.reverse();
    }
  }
  return null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
