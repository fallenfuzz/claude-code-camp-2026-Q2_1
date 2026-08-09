import type { WorldNode } from "../contracts";

/**
 * Where every room in the world sits, worked out once and shipped as a
 * file. A room's square is a lookup, so the same room is drawn in the same
 * place in every view and on every render.
 *
 * Positions are relative to their own floor: two floors are separate grids
 * and their origins have no relationship to each other.
 */
export type RoomSquare = {
  zone: number;
  level: number;
  x: number;
  y: number;
};

export type RoomLayout = {
  square: (vnum: number) => RoomSquare | null;
  /** Links whose squares make their direction untrue, drawn as arcs. */
  arcs: ReadonlySet<string>;
  rooms: number;
};

/** Room number to zone, level, x, y, packed as an array to keep it small. */
type LayoutFile = {
  rooms: Record<string, [number, number, number, number]>;
  arcs: Array<[number, string, number]>;
};

export const layoutUrl = "/world-layout.json";

export const emptyRoomLayout: RoomLayout = {
  square: () => null,
  arcs: new Set<string>(),
  rooms: 0,
};

export function arcKey(source: number, direction: string, target: number) {
  return `${source}:${direction}:${target}`;
}

export function readRoomLayout(file: LayoutFile): RoomLayout {
  const squares = new Map<number, RoomSquare>();
  for (const [vnum, packed] of Object.entries(file.rooms)) {
    squares.set(Number(vnum), {
      zone: packed[0],
      level: packed[1],
      x: packed[2],
      y: packed[3],
    });
  }
  const arcs = new Set(
    file.arcs.map(([source, direction, target]) =>
      arcKey(source, direction, target)),
  );
  return {
    square: (vnum) => squares.get(vnum) ?? null,
    arcs,
    rooms: squares.size,
  };
}

/**
 * The square a node sits on, or null when the world file has none for it.
 * The room number comes from the atlas correlation, which is the only thing
 * that ties a remembered room to the world the observer can read.
 */
export function squareOf(
  layout: RoomLayout,
  node: WorldNode,
): RoomSquare | null {
  const vnum = node.atlas?.vnum;
  if (vnum === undefined || vnum === null) return null;
  return layout.square(vnum);
}

let pending: Promise<RoomLayout> | null = null;

/** Fetched once for the life of the page, because it never changes. */
export function loadRoomLayout(fetcher: typeof fetch = fetch) {
  if (pending === null) {
    pending = fetcher(layoutUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`layout ${response.status}`);
        return response.json() as Promise<LayoutFile>;
      })
      .then(readRoomLayout)
      .catch(() => emptyRoomLayout);
  }
  return pending;
}

export function forgetRoomLayout() {
  pending = null;
}
