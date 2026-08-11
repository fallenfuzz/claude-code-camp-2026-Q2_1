import { describe, expect, it } from "vitest";

import { mapRoomHeight, mapRoomWidth } from "./mapModel";
import { mapRoomEdge } from "./mapDrawing";

describe("mapRoomEdge", () => {
  it("joins horizontal and vertical links to the exact room border", () => {
    const center = { x: 200, y: 160 };

    expect(mapRoomEdge(center, { x: 400, y: 160 })).toEqual({
      x: center.x + mapRoomWidth / 2,
      y: center.y,
    });
    expect(mapRoomEdge(center, { x: 200, y: 360 })).toEqual({
      x: center.x,
      y: center.y + mapRoomHeight / 2,
    });
  });

  it("joins diagonal links to the first room border they meet", () => {
    const center = { x: 200, y: 160 };
    const edge = mapRoomEdge(center, { x: 400, y: 360 });

    expect(edge.x).toBe(center.x + mapRoomHeight / 2);
    expect(edge.y).toBe(center.y + mapRoomHeight / 2);
  });
});
