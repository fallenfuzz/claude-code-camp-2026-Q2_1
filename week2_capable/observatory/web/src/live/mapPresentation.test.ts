import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  WorldNode,
} from "../contracts";
import type {
  MapConnection,
  MapGraph,
} from "./mapModel";
import {
  automaticMapMode,
  changeMapZoom,
  projectLanternOpacities,
  projectMapPresentation,
  transitionMapCamera,
  visibleRoomComponentSize,
} from "./mapPresentation";

describe("map presentation", () => {
  it("keeps complete evidence in Grow and Lantern", () => {
    const graph = lineGraph(6);
    for (const mode of ["grow", "lantern"] as const) {
      const projection = projectMapPresentation(
        graph,
        mode,
        null,
      );
      expect(projection.visibleRoomIds.size).toBe(6);
      expect(projection.visibleConnectionIds.size).toBe(5);
    }
  });

  it("uses graph-distance Lantern tiers and keeps the graph faint", () => {
    const graph = lineGraph(5);
    const opacities = projectLanternOpacities(graph);

    expect(opacities.get("room-0")).toBe(1);
    expect(opacities.get("room-1")).toBe(0.8);
    expect(opacities.get("room-2")).toBe(0.5);
    expect(opacities.get("room-3")).toBe(0.12);
    expect(opacities.get("room-4")).toBe(0.12);
  });
});

describe("map camera state", () => {
  it("separates drag, follow, fit, selection, and zoom transitions", () => {
    expect(transitionMapCamera("follow", "drag")).toBe("manual");
    expect(transitionMapCamera("manual", "fit")).toBe("fit");
    expect(transitionMapCamera("fit", "room-select")).toBe("fit");
    expect(transitionMapCamera("fit", "zoom")).toBe("fit");
    expect(transitionMapCamera("manual", "session-change")).toBe("follow");
  });

  it("clamps zoom to the documented readable range", () => {
    expect(changeMapZoom(2, "in")).toBe(2);
    expect(changeMapZoom(0.1, "out")).toBe(0.1);
    expect(changeMapZoom(1, "in")).toBe(1.25);
    expect(changeMapZoom(1, "out")).toBe(0.8);
  });
});

function lineGraph(roomCount: number): MapGraph {
  const rooms = Array.from({ length: roomCount }, (_, index) => ({
    node: room(`room-${index}`, index + 1),
    point: { x: index * 148, y: 0 },
  }));
  const connections = rooms.slice(1).map((item, index) => {
    return connection(
      `edge-${index}`,
      rooms[index].node.id,
      item.node.id,
      index + 1,
    );
  });
  return {
    rooms,
    connections,
    currentRoomId: "room-0",
    x: -92,
    y: -92,
    width: roomCount * 148 + 184,
    height: 248,
  };
}

function starGraph(roomCount: number): MapGraph {
  const graph = lineGraph(roomCount);
  graph.connections = graph.rooms.slice(1).map((item, index) => {
    return connection(
      `edge-${index}`,
      "room-0",
      item.node.id,
      index + 1,
    );
  });
  return graph;
}

function connection(
  id: string,
  source: string,
  target: string,
  firstSequence: number,
): MapConnection {
  return {
    id,
    source,
    target,
    direction: "east",
    firstSequence,
    displacement: false,
    vertical: false,
    bent: false,
    oneWay: false,
    hop: false,
    walked: false,
  };
}

function room(id: string, sequence: number): WorldNode {
  return {
    id,
    place: sequence,
    title: id,
    description: null,
    atlas: null,
    exits: [],
    mobs: [],
    objects: [],
    mob_sightings: [],
    object_sightings: [],
    visits: 1,
    evidence: [sequence],
    first_seq: sequence,
    last_seq: sequence,
    state: id === "room-0" ? "current" : "observed",
    confidence: "tracked",
    method: "fixture",
  };
}
