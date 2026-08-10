import type { AtlasNode } from "../contracts";
import {
  arcKey,
  type RoomLayout,
  type RoomSquare,
} from "./roomLayout";

export type MapGhostRoom = {
  atlas: AtlasNode | null;
  sighted: boolean;
  square: RoomSquare;
};

export type MapGhostLink = {
  id: string;
  source: RoomSquare;
  target: RoomSquare;
  hop: boolean;
  oneWay: boolean;
};

export type MapGhostProjection = {
  links: MapGhostLink[];
  rooms: MapGhostRoom[];
};

const planarDirections = new Set(["north", "east", "south", "west"]);
type DirectedLink = {
  direction: string;
  source: RoomSquare;
  target: RoomSquare;
};

export function projectMapGhosts({
  atlasNodes,
  floor,
  layout,
  visitedVnums,
}: {
  atlasNodes: AtlasNode[];
  floor: RoomSquare[];
  layout: RoomLayout;
  visitedVnums: ReadonlySet<number>;
}): MapGhostProjection {
  const atlas = new Map(atlasNodes.map((node) => [node.vnum, node]));
  const floorVnums = new Set(floor.map(({ vnum }) => vnum));
  const sighted = new Set<number>();
  const directed: DirectedLink[] = [];

  for (const source of atlasNodes) {
    if (!floorVnums.has(source.vnum)) continue;
    for (const [direction, targetVnum] of Object.entries(source.exits)) {
      if (!planarDirections.has(direction) || !floorVnums.has(targetVnum)) {
        continue;
      }
      const sourceSquare = layout.square(source.vnum);
      const targetSquare = layout.square(targetVnum);
      if (sourceSquare === null || targetSquare === null) continue;
      directed.push({
        direction,
        source: sourceSquare,
        target: targetSquare,
      });
      if (visitedVnums.has(source.vnum) && !visitedVnums.has(targetVnum)) {
        sighted.add(targetVnum);
      }
    }
  }

  const grouped = new Map<string, DirectedLink[]>();
  for (const link of directed) {
    const low = Math.min(link.source.vnum, link.target.vnum);
    const high = Math.max(link.source.vnum, link.target.vnum);
    const key = `${low}:${high}`;
    const links = grouped.get(key);
    if (links === undefined) grouped.set(key, [link]);
    else links.push(link);
  }
  const occupied = new Set(floor.map(({ x, y }) => `${x}:${y}`));
  const crossings = crossingLinks([...grouped.entries()], occupied);
  const links = [...grouped.entries()].map(([id, directions]) => {
    const first = directions[0];
    if (first === undefined) throw new Error(`Empty atlas link ${id}`);
    const hasReturn = directions.some((candidate) => (
      candidate.source.vnum === first.target.vnum
      && candidate.target.vnum === first.source.vnum
    ));
    return {
      id: `ghost-link:${id}`,
      source: first.source,
      target: first.target,
      oneWay: !hasReturn,
      hop: crossings.has(id) || directions.some((candidate) => (
        layout.arcs.has(arcKey(
          candidate.source.vnum,
          candidate.direction,
          candidate.target.vnum,
        ))
      )),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  return {
    links,
    rooms: floor
      .filter(({ vnum }) => !visitedVnums.has(vnum))
      .map((square) => ({
        atlas: atlas.get(square.vnum) ?? null,
        sighted: sighted.has(square.vnum),
        square,
      })),
  };
}

function crossingLinks(
  groups: Array<[string, DirectedLink[]]>,
  occupied: ReadonlySet<string>,
): Set<string> {
  const lines = groups.flatMap(([id, links]) => {
    const link = links[0];
    return link === undefined ? [] : [{ id, ...link }];
  });
  const crossed = new Set<string>();
  for (const line of lines) {
    for (const point of occupied) {
      const [rawX, rawY] = point.split(":");
      const x = Number(rawX);
      const y = Number(rawY);
      if (
        (x === line.source.x && y === line.source.y)
        || (x === line.target.x && y === line.target.y)
      ) {
        continue;
      }
      const cross = (
        (line.target.x - line.source.x) * (y - line.source.y)
        - (line.target.y - line.source.y) * (x - line.source.x)
      );
      const between = (
        x >= Math.min(line.source.x, line.target.x)
        && x <= Math.max(line.source.x, line.target.x)
        && y >= Math.min(line.source.y, line.target.y)
        && y <= Math.max(line.source.y, line.target.y)
      );
      if (cross === 0 && between) {
        crossed.add(line.id);
        break;
      }
    }
  }
  for (let leftIndex = 0; leftIndex < lines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lines.length; rightIndex += 1) {
      const left = lines[leftIndex];
      const right = lines[rightIndex];
      if (left === undefined || right === undefined) continue;
      const leftFlat = left.source.y === left.target.y;
      const rightFlat = right.source.y === right.target.y;
      if (leftFlat === rightFlat) continue;
      const horizontal = leftFlat ? left : right;
      const vertical = leftFlat ? right : left;
      if (
        Math.min(horizontal.source.x, horizontal.target.x) < vertical.source.x
        && vertical.source.x < Math.max(horizontal.source.x, horizontal.target.x)
        && Math.min(vertical.source.y, vertical.target.y) < horizontal.source.y
        && horizontal.source.y < Math.max(vertical.source.y, vertical.target.y)
      ) {
        crossed.add(vertical.id);
      }
    }
  }
  return crossed;
}
