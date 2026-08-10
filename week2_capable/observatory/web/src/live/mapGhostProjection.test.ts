import {
  describe,
  expect,
  it,
} from "vitest";

import type { AtlasNode } from "../contracts";
import { projectMapGhosts } from "./mapGhostProjection";
import {
  readRoomLayout,
} from "./roomLayout";

const layout = readRoomLayout({
  rooms: {
    "3005": [30, 0, 0, 0],
    "3006": [30, 0, 1, 0],
    "3007": [30, 0, 2, 0],
  },
  arcs: [],
});

const atlas: AtlasNode[] = [
  room(3005, "The Temple Square", { east: 3006 }),
  room(3006, "The Entrance Hall", { east: 3007, west: 3005 }),
  room(3007, "The Grunting Boar", { west: 3006 }),
];

describe("map ghost projection", () => {
  it("shows all fixed game-data links without treating rooms as visited", () => {
    const projection = projectMapGhosts({
      atlasNodes: atlas,
      floor: layout.floor(30, 0),
      layout,
      visitedVnums: new Set(),
    });

    expect(projection.rooms).toHaveLength(3);
    expect(projection.rooms.every(({ sighted }) => !sighted)).toBe(true);
    expect(projection.links).toHaveLength(2);
    expect(projection.links.every(({ oneWay }) => !oneWay)).toBe(true);
  });

  it("labels only the unvisited room identified by a visited exit", () => {
    const projection = projectMapGhosts({
      atlasNodes: atlas,
      floor: layout.floor(30, 0),
      layout,
      visitedVnums: new Set([3005]),
    });

    expect(projection.rooms.map(({ atlas: node, sighted }) => ({
      title: node?.title,
      vnum: node?.vnum,
      sighted,
    }))).toEqual([
      { title: "The Entrance Hall", vnum: 3006, sighted: true },
      { title: "The Grunting Boar", vnum: 3007, sighted: false },
    ]);
  });

  it("keeps one-way and saved arc information on ghost links", () => {
    const oneWayLayout = readRoomLayout({
      rooms: {
        "3005": [30, 0, 0, 0],
        "3006": [30, 0, 2, 1],
      },
      arcs: [[3005, "east", 3006]],
    });
    const projection = projectMapGhosts({
      atlasNodes: [
        room(3005, "The Temple Square", { east: 3006 }),
        room(3006, "The Entrance Hall", {}),
      ],
      floor: oneWayLayout.floor(30, 0),
      layout: oneWayLayout,
      visitedVnums: new Set(),
    });

    expect(projection.links[0]).toMatchObject({
      hop: true,
      oneWay: true,
    });
  });
});

function room(
  vnum: number,
  title: string,
  exits: Record<string, number>,
): AtlasNode {
  return {
    id: `room:${vnum}`,
    vnum,
    title,
    zone: 30,
    sector: "city",
    exits,
  };
}
