import {
  describe,
  expect,
  it,
} from "vitest";

import type { WorldNode } from "../contracts";
import {
  border,
  projectMapFloorFeatures,
} from "./mapFloorProjection";
import {
  mapColumnGap,
  mapRoomHeight,
  mapRoomWidth,
  mapRowGap,
  type MapRoom,
} from "./mapModel";
import { readRoomLayout } from "./roomLayout";

const layout = readRoomLayout({
  rooms: {
    "3005": [30, 0, 1, 1],
    "3006": [30, 0, 2, 1],
    "3007": [30, 0, 2, 2],
    "3008": [30, 0, 1, 2],
  },
  arcs: [],
});

describe("map floor features", () => {
  it("places a level exit away from every room and game-data link", () => {
    const source = room(3005);
    const mapRoom: MapRoom = {
      node: source,
      point: {
        x: mapColumnGap,
        y: mapRowGap,
      },
    };
    const targetSquare = layout.square(3006);
    const sourceSquare = layout.square(3005);
    if (sourceSquare === null || targetSquare === null) {
      throw new Error("Test layout is incomplete");
    }
    const projection = projectMapFloorFeatures({
      nodes: [source],
      edges: [],
      rooms: [mapRoom],
      verticalByRoom: new Map([
        ["vnum:3005", [{ direction: "down", state: "frontier" }]],
      ]),
      layout,
      gameLinks: [{
        id: "ghost-link:3005:3006",
        source: sourceSquare,
        target: targetSquare,
        hop: false,
        oneWay: false,
      }],
    });

    const disc = projection.stairs[0]?.disc;
    expect(disc).toBeDefined();
    if (disc === undefined) return;
    for (const square of layout.floor(30, 0)) {
      const center = {
        x: square.x * mapColumnGap + mapRoomWidth / 2,
        y: square.y * mapRowGap + mapRoomHeight / 2,
      };
      expect(
        Math.abs(disc.x - center.x) > mapRoomWidth / 2 + 17
        || Math.abs(disc.y - center.y) > mapRoomHeight / 2 + 32,
      ).toBe(true);
    }
    const linkStart = {
      x: sourceSquare.x * mapColumnGap + mapRoomWidth / 2,
      y: sourceSquare.y * mapRowGap + mapRoomHeight / 2,
    };
    const linkEnd = {
      x: targetSquare.x * mapColumnGap + mapRoomWidth / 2,
      y: targetSquare.y * mapRowGap + mapRoomHeight / 2,
    };
    expect(distanceFromSegment(disc, linkStart, linkEnd)).toBeGreaterThan(34);
    expect(disc.x).not.toBe(mapRoom.point.x + mapRoomWidth / 2);
    expect(disc.y).not.toBe(mapRoom.point.y + mapRoomHeight / 2);
    const roomCenter = {
      x: mapRoom.point.x + mapRoomWidth / 2,
      y: mapRoom.point.y + mapRoomHeight / 2,
    };
    const anchor = border(roomCenter, disc);
    expect(Math.hypot(
      disc.x - anchor.x,
      disc.y - anchor.y,
    )).toBeLessThan(105);
  });

  it("anchors a diagonal level exit on the matching room corner", () => {
    expect(border({ x: 100, y: 100 }, { x: 220, y: 180 })).toEqual({
      x: 100 + mapRoomWidth / 2,
      y: 100 + mapRoomHeight / 2,
    });
  });
});

function distanceFromSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const part = Math.max(0, Math.min(1, (
    (point.x - start.x) * deltaX + (point.y - start.y) * deltaY
  ) / lengthSquared));
  return Math.hypot(
    point.x - (start.x + part * deltaX),
    point.y - (start.y + part * deltaY),
  );
}

function room(vnum: number): WorldNode {
  return {
    id: `vnum:${vnum}`,
    place: vnum,
    title: `Room ${vnum}`,
    description: null,
    atlas: {
      vnum,
      zone_id: 30,
      zone_label: "Midgaard",
      sector: "city",
      atlas_digest: "atlas",
      confidence: "high",
      evidence: ["test"],
    },
    exits: ["down"],
    mobs: [],
    objects: [],
    mob_sightings: [],
    object_sightings: [],
    visits: 1,
    evidence: [1],
    first_seq: 1,
    last_seq: 1,
    state: "current",
    confidence: "verified",
    method: "test",
  };
}
