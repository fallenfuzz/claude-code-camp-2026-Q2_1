import { describe, expect, it } from "vitest";

import type { WorldNode } from "../contracts";
import { projectMapConnections } from "./mapConnectionPresentation";
import type { MapConnection, MapRoom } from "./mapModel";

function room(id: string, vnum: number): MapRoom {
  return {
    node: {
      id,
      place: vnum,
      title: id,
      description: null,
      atlas: {
        vnum,
        zone_id: 30,
        zone_label: "Midgaard",
        sector: "city",
        atlas_digest: "atlas",
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
    } satisfies WorldNode,
    point: { x: 0, y: 0 },
  };
}

describe("projectMapConnections", () => {
  it("keeps walked evidence but takes fixed-floor geometry from the world", () => {
    const connection: MapConnection = {
      id: "temple-square",
      source: "temple",
      target: "square",
      direction: "down",
      firstSequence: 1,
      displacement: false,
      vertical: true,
      bent: true,
      oneWay: true,
      hop: false,
      walked: true,
    };

    expect(projectMapConnections(
      [connection],
      [room("temple", 3001), room("square", 3005)],
      [{
        id: "ghost-link:3001:3005",
        source: { vnum: 3001, zone: 30, level: 0, x: 0, y: 0 },
        target: { vnum: 3005, zone: 30, level: 0, x: 0, y: 1 },
        oneWay: false,
        hop: false,
      }],
    )[0]).toMatchObject({
      walked: true,
      vertical: false,
      bent: false,
      oneWay: false,
    });
  });
});
