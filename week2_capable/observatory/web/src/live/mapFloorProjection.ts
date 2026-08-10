import type {
  WorldEdge,
  WorldNode,
} from "../contracts";
import {
  canonicalNodeId,
  mapColumnGap,
  mapRoomHeight,
  mapRoomWidth,
  mapRowGap,
  type MapPoint,
  type MapRoom,
} from "./mapModel";
import type { MapGhostLink } from "./mapGhostProjection";
import {
  normalizeDirection,
  type VerticalMarker,
} from "./markerProjection";
import type { RoomLayout } from "./roomLayout";

export type MapStair = {
  id: string;
  source: string;
  way: "up" | "down";
  at: MapPoint;
  disc: MapPoint;
  targetVnum: number | null;
  targetFloor: number | null;
  opened: boolean;
  dim: boolean;
  arrival: boolean;
  barred: boolean;
};

export type MapHoleWay = {
  leaves: MapPoint;
  anchor: MapPoint;
};

export type MapHole = {
  id: string;
  title: string;
  trap: boolean;
  ways: MapHoleWay[];
};

export type MapFloorFeatures = {
  stairs: MapStair[];
  holes: MapHole[];
};

type CanonicalEdge = WorldEdge & {
  source: string;
  target: string;
};

type BusyRect = MapPoint & {
  width: number;
  height: number;
};

const planarVectors: Record<string, MapPoint> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

export function projectMapFloorFeatures({
  nodes,
  edges,
  rooms,
  verticalByRoom,
  layout,
  gameLinks = [],
}: {
  nodes: WorldNode[];
  edges: WorldEdge[];
  rooms: MapRoom[];
  verticalByRoom: ReadonlyMap<string, VerticalMarker[]>;
  layout: RoomLayout;
  gameLinks?: MapGhostLink[];
}): MapFloorFeatures {
  const canonicalIds = new Map(
    nodes.map((node) => [node.id, canonicalNodeId(node)]),
  );
  const canonicalNodes = new Map<string, WorldNode>();
  for (const node of nodes) {
    const id = canonicalNodeId(node);
    if (!canonicalNodes.has(id)) canonicalNodes.set(id, node);
  }
  const canonicalEdges: CanonicalEdge[] = edges.flatMap((edge) => {
    const source = canonicalIds.get(edge.source);
    const target = canonicalIds.get(edge.target);
    return source === undefined || target === undefined
      ? []
      : [{ ...edge, source, target }];
  });
  const roomPoints = new Map(rooms.map(({ node, point }) => [
    node.id,
    {
      x: point.x + mapRoomWidth / 2,
      y: point.y + mapRoomHeight / 2,
    },
  ]));
  const holes = projectHoles(
    canonicalEdges,
    canonicalNodes,
    roomPoints,
    layout,
  );
  const stairSeeds = projectStairSeeds(
    canonicalEdges,
    canonicalNodes,
    roomPoints,
    verticalByRoom,
    layout,
  );
  return {
    holes,
    stairs: placeStairs(stairSeeds, rooms, holes, gameLinks, layout),
  };
}

type StairSeed = Omit<MapStair, "disc">;

function projectStairSeeds(
  edges: CanonicalEdge[],
  nodes: ReadonlyMap<string, WorldNode>,
  roomPoints: ReadonlyMap<string, MapPoint>,
  verticalByRoom: ReadonlyMap<string, VerticalMarker[]>,
  layout: RoomLayout,
): StairSeed[] {
  const stairs: StairSeed[] = [];
  for (const [source, markers] of verticalByRoom) {
    const at = roomPoints.get(source);
    if (at === undefined) continue;
    for (const marker of markers) {
      const edge = edges.find((candidate) => (
        candidate.source === source
        && normalizeDirection(candidate.direction) === marker.direction
      ));
      const target = edge === undefined ? undefined : nodes.get(edge.target);
      const targetVnum = target?.atlas?.vnum ?? null;
      const square = targetVnum === null ? null : layout.square(targetVnum);
      const reverse = marker.direction === "up" ? "down" : "up";
      const hasReturn = edge !== undefined && edges.some((candidate) => (
        candidate.source === edge.target
        && candidate.target === source
        && normalizeDirection(candidate.direction) === reverse
      ));
      stairs.push({
        id: `stair:${source}:${marker.direction}`,
        source,
        way: marker.direction,
        at,
        targetVnum,
        targetFloor: square?.level ?? null,
        opened: marker.state === "traversed" && edge !== undefined,
        dim: nodes.get(source)?.state === "candidate",
        arrival: false,
        barred: edge !== undefined && !hasReturn,
      });
    }
  }

  for (const edge of edges) {
    const direction = normalizeDirection(edge.direction);
    if (direction !== "up" && direction !== "down") continue;
    const at = roomPoints.get(edge.target);
    if (at === undefined || roomPoints.has(edge.source)) continue;
    const reverse = direction === "up" ? "down" : "up";
    const hasReturn = edges.some((candidate) => (
      candidate.source === edge.target
      && candidate.target === edge.source
      && normalizeDirection(candidate.direction) === reverse
    ));
    if (hasReturn) continue;
    const source = nodes.get(edge.source);
    const vnum = source?.atlas?.vnum ?? null;
    const square = vnum === null ? null : layout.square(vnum);
    stairs.push({
      id: `stair:${edge.target}:arrival:${edge.source}`,
      source: edge.target,
      way: reverse,
      at,
      targetVnum: vnum,
      targetFloor: square?.level ?? null,
      opened: true,
      dim: nodes.get(edge.target)?.state === "candidate",
      arrival: true,
      barred: true,
    });
  }
  return stairs.sort((left, right) => left.id.localeCompare(right.id));
}

function projectHoles(
  edges: CanonicalEdge[],
  nodes: ReadonlyMap<string, WorldNode>,
  roomPoints: ReadonlyMap<string, MapPoint>,
  layout: RoomLayout,
): MapHole[] {
  const grouped = new Map<string, MapHoleWay[]>();
  for (const edge of edges) {
    const from = roomPoints.get(edge.source);
    const target = nodes.get(edge.target);
    const targetSquare = target?.atlas?.vnum === undefined
      ? null
      : layout.square(target.atlas.vnum);
    const direction = normalizeDirection(edge.direction);
    const vector = direction === null ? undefined : planarVectors[direction];
    if (
      from === undefined
      || roomPoints.has(edge.target)
      || targetSquare !== null
      || vector === undefined
    ) {
      continue;
    }
    const far = {
      x: from.x + vector.x * 200,
      y: from.y + vector.y * 200,
    };
    const ways = grouped.get(edge.target) ?? [];
    ways.push({
      leaves: roomEdge(from, far),
      anchor: {
        x: from.x + vector.x * 122,
        y: from.y + vector.y * 78,
      },
    });
    grouped.set(edge.target, ways);
  }
  return [...grouped].map(([target, ways]) => ({
    id: `hole:${target}`,
    title: nodes.get(target)?.title ?? "Unknown destination",
    trap: !edges.some((edge) => edge.source === target),
    ways,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function placeStairs(
  seeds: StairSeed[],
  rooms: MapRoom[],
  holes: MapHole[],
  gameLinks: MapGhostLink[],
  layout: RoomLayout,
): MapStair[] {
  const busy: BusyRect[] = rooms.map(({ point }) => ({
    x: point.x + mapRoomWidth / 2,
    y: point.y + mapRoomHeight / 2,
    width: mapRoomWidth / 2 + 26,
    height: mapRoomHeight / 2 + 26,
  }));
  const floor = rooms.flatMap(({ node }) => {
    const vnum = node.atlas?.vnum;
    const square = vnum === undefined ? null : layout.square(vnum);
    return square === null ? [] : [square];
  })[0];
  if (floor !== undefined) {
    for (const square of layout.floor(floor.zone, floor.level)) {
      busy.push({
        x: square.x * mapColumnGap + mapRoomWidth / 2,
        y: square.y * mapRowGap + mapRoomHeight / 2,
        width: mapRoomWidth / 2 + 26,
        height: mapRoomHeight / 2 + 26,
      });
    }
  }
  for (const hole of holes) {
    const anchors = hole.ways.map(({ anchor }) => anchor);
    const lowX = Math.min(...anchors.map(({ x }) => x));
    const highX = Math.max(...anchors.map(({ x }) => x));
    const lowY = Math.min(...anchors.map(({ y }) => y));
    const highY = Math.max(...anchors.map(({ y }) => y));
    busy.push({
      x: (lowX + highX) / 2,
      y: (lowY + highY) / 2,
      width: (highX - lowX) / 2 + 66,
      height: (highY - lowY) / 2 + 31,
    });
  }
  const mapLinks = gameLinks.map(({ source, target }) => ({
    from: squareCenter(source),
    to: squareCenter(target),
  }));
  const tethers: Array<{ from: MapPoint; to: MapPoint }> = [];
  return seeds.map((seed) => {
    const space = (point: MapPoint): number => {
      const clear = Math.min(...busy.map((item) => Math.max(
        Math.abs(point.x - item.x) - (item.width + 18),
        Math.abs(point.y - item.y) - (item.height + 22),
      )));
      const start = border(seed.at, point);
      const collidesWithTether = tethers.some((line) => segmentsMeet(
        start,
        point,
        line.from,
        line.to,
      ));
      const collidesWithMap = mapLinks.some((line) => (
        segmentsMeet(start, point, line.from, line.to)
        || pointSegmentDistance(point, line.from, line.to) < 34
      ));
      return collidesWithTether || collidesWithMap ? -999 : clear;
    };
    const disc = stairSpot(
      seed.at,
      seed.way,
      space,
      seed.arrival ? "left" : "right",
    );
    tethers.push({ from: border(seed.at, disc), to: disc });
    busy.push({ x: disc.x, y: disc.y, width: 24, height: 30 });
    return { ...seed, disc };
  });
}

function stairSpot(
  at: MapPoint,
  way: "up" | "down",
  space: (point: MapPoint) => number,
  prefer: "left" | "right",
): MapPoint {
  const side = way === "up" ? -1 : 1;
  const near = prefer === "left" ? -1 : 1;
  const offsets: Array<MapPoint & { cardinal: boolean; ring: number }> = [];
  for (const [ring, reach] of [0, 34, 72].entries()) {
    const wide = mapRoomWidth / 2 + 30 + reach;
    const tall = mapRoomHeight / 2 + 30 + reach * 0.7;
    offsets.push(
      { x: near * wide, y: side * tall, cardinal: false, ring },
      { x: -near * wide, y: side * tall, cardinal: false, ring },
      { x: near * wide, y: -side * tall, cardinal: false, ring },
      { x: -near * wide, y: -side * tall, cardinal: false, ring },
      {
        x: 0,
        y: side * (mapRoomHeight / 2 + 32 + reach),
        cardinal: true,
        ring,
      },
      {
        x: near * (mapRoomWidth / 2 + 34 + reach),
        y: 0,
        cardinal: true,
        ring,
      },
      {
        x: -near * (mapRoomWidth / 2 + 34 + reach),
        y: 0,
        cardinal: true,
        ring,
      },
    );
  }
  const points = offsets.map((offset) => ({
    x: at.x + offset.x,
    y: at.y + offset.y,
    cardinal: offset.cardinal,
    ring: offset.ring,
  }));
  for (const cardinal of [false, true]) {
    for (const ring of [0, 1, 2]) {
      const clear = points
        .filter((point) => point.cardinal === cardinal && point.ring === ring)
        .filter((point) => space(point) > 0)
        .sort((left, right) => space(right) - space(left));
      if (clear[0] !== undefined) return clear[0];
    }
  }
  return points.reduce((best, point) => (
    space(point) > space(best) ? point : best
  ));
}

function squareCenter(square: { x: number; y: number }): MapPoint {
  return {
    x: square.x * mapColumnGap + mapRoomWidth / 2,
    y: square.y * mapRowGap + mapRoomHeight / 2,
  };
}

function pointSegmentDistance(
  point: MapPoint,
  start: MapPoint,
  end: MapPoint,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * deltaX + (point.y - start.y) * deltaY
  ) / lengthSquared));
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
}

export function border(at: MapPoint, towards: MapPoint): MapPoint {
  return {
    x: Math.max(
      at.x - mapRoomWidth / 2,
      Math.min(at.x + mapRoomWidth / 2, towards.x),
    ),
    y: Math.max(
      at.y - mapRoomHeight / 2,
      Math.min(at.y + mapRoomHeight / 2, towards.y),
    ),
  };
}

function roomEdge(from: MapPoint, to: MapPoint): MapPoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (deltaX === 0 && deltaY === 0) return from;
  const scale = Math.min(
    Math.abs(deltaX) > 0.001
      ? Math.abs((mapRoomWidth / 2 + 2) / deltaX)
      : Infinity,
    Math.abs(deltaY) > 0.001
      ? Math.abs((mapRoomHeight / 2 + 2) / deltaY)
      : Infinity,
  );
  return {
    x: from.x + deltaX * scale,
    y: from.y + deltaY * scale,
  };
}

function segmentsMeet(
  first: MapPoint,
  second: MapPoint,
  third: MapPoint,
  fourth: MapPoint,
): boolean {
  const turn = (a: MapPoint, b: MapPoint, c: MapPoint) => Math.sign(
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  );
  return turn(first, second, third) !== turn(first, second, fourth)
    && turn(third, fourth, first) !== turn(third, fourth, second);
}
