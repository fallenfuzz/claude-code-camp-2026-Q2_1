import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WorldEdge,
  WorldNode,
} from "../contracts";
import {
  buildMapGraph,
  mapColumnGap,
  mapRowGap,
} from "./mapModel";
import {
  emptyRoomLayout,
  readRoomLayout,
} from "./roomLayout";

function room(id: string, vnum: number | null): WorldNode {
  return {
    id,
    place: Number(id),
    title: id,
    description: null,
    atlas: vnum === null ? null : {
      vnum,
      zone_id: 186,
      zone_label: "Newbie Zone",
      sector: "inside",
      atlas_digest: "digest",
      confidence: "high",
      evidence: [],
    },
    exits: [],
    mobs: [],
    objects: [],
    mob_sightings: [],
    object_sightings: [],
    visits: 1,
    evidence: [],
    first_seq: 1,
    last_seq: 1,
    state: "observed",
    confidence: "high",
    method: "atlas",
  };
}

function link(source: string, target: string, direction: string): WorldEdge {
  return {
    id: `${source}>${target}`,
    source,
    target,
    direction,
    traversals: 1,
    evidence: [1],
  };
}

// The three rooms the agent fled through, which have no known direction
// between them, and which the world file says are a straight corridor.
const corridor = readRoomLayout({
  rooms: {
    "18601": [186, 1, 0, 1],
    "18602": [186, 1, 1, 1],
    "18603": [186, 1, 2, 1],
  },
  arcs: [[18601, "east", 18602]],
});

describe("the saved layout", () => {
  it("places rooms where the world says, not where the walk went", () => {
    const nodes = [room("a", 18601), room("b", 18602), room("c", 18603)];
    const edges = [link("a", "b", "flee"), link("b", "c", "flee")];

    const walked = buildMapGraph(nodes, edges, emptyRoomLayout);
    const fixed = buildMapGraph(nodes, edges, corridor);

    const row = (graph: typeof fixed) =>
      graph.rooms.map(({ point }) => point.y);
    // Without the layout an unknown direction becomes a diagonal, so the
    // three rooms sit on three different rows.
    expect(new Set(row(walked)).size).toBe(3);
    // With it they are the straight corridor the world says they are.
    expect(new Set(row(fixed)).size).toBe(1);
    expect(fixed.rooms.map(({ point }) => point.x)).toEqual([
      0,
      mapColumnGap,
      mapColumnGap * 2,
    ]);
  });

  it("does not move a room when the evidence changes", () => {
    const nodes = [room("a", 18601), room("b", 18602), room("c", 18603)];
    const before = buildMapGraph(nodes, [link("a", "b", "east")], corridor);
    const after = buildMapGraph(
      nodes,
      [link("a", "b", "east"), link("b", "c", "east")],
      corridor,
    );
    const at = (graph: typeof before, id: string) =>
      graph.rooms.find(({ node }) => node.id === id)?.point;
    expect(at(after, "a")).toEqual(at(before, "a"));
    expect(at(after, "b")).toEqual(at(before, "b"));
  });

  it("keeps fixed rooms fixed when another room has no square", () => {
    const nodes = [room("a", 18601), room("b", 99999)];
    const graph = buildMapGraph(nodes, [link("a", "b", "east")], corridor);
    expect(graph.rooms.map(({ node }) => node.id)).toEqual(["vnum:18601"]);
    expect(graph.rooms[0]?.point).toEqual({ x: 0, y: mapRowGap });
  });

  it("draws one floor, the one the agent is standing on", () => {
    const twoFloors = readRoomLayout({
      rooms: { "18601": [186, 1, 0, 0], "18632": [186, 0, 0, 0] },
      arcs: [],
    });
    const upstairs = room("a", 18601);
    const downstairs = { ...room("b", 18632), state: "current" as const };
    const graph = buildMapGraph(
      [upstairs, downstairs],
      [link("a", "b", "down")],
      twoFloors,
    );
    // Both sit at 0,0 of their own floor, and the two origins mean nothing
    // to each other. Only the floor the agent is on is drawn.
    expect(graph.rooms.map(({ node }) => node.atlas?.vnum)).toEqual([18632]);
    expect(graph.currentRoomId).toBe(graph.rooms[0]?.node.id);
  });

  it("keeps the fixed floor when an observed room has no atlas identity", () => {
    const nodes = [room("a", 18601), room("b", null)];
    const graph = buildMapGraph(nodes, [link("a", "b", "east")], corridor);
    expect(graph.rooms.map(({ node }) => node.id)).toEqual(["vnum:18601"]);
  });

  it("reads the arcs the saved squares make untrue", () => {
    expect(corridor.arcs.has("18601:east:18602")).toBe(true);
    expect(corridor.arcs.has("18602:east:18603")).toBe(false);
  });

  it("counts what it loaded", () => {
    expect(corridor.rooms).toBe(3);
    expect(emptyRoomLayout.rooms).toBe(0);
  });
});
