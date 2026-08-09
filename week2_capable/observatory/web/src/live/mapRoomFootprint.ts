import type { WorldNode } from "../contracts";
import {
  mapRoomHeight,
  mapRoomWidth,
  type MapPoint,
} from "./mapModel";

export type MapRoomFootprint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const mapRoomTitleCharacterLimit = 18;

/** Where the name and the number start inside the card. */
export const mapRoomPadding = 12;

const mapRoomTitleMaximumWidth = mapRoomWidth - mapRoomPadding - 14;
const mapRoomTitleWidthBuffer = 0;
const mapRoomBadgeTop = -10;
const mapRoomObjectBadgeLeft = -9;
const mapRoomVisitBadgeRight = mapRoomWidth + 10;

export function mapRoomFootprint(
  node: WorldNode,
  point: MapPoint,
  current: boolean,
): MapRoomFootprint {
  // The name now sits inside the card, so the room's own box is the whole
  // of it, with only the badges reaching outside.
  const left = Math.min(
    point.x,
    node.object_sightings.length > 0
      ? point.x + mapRoomObjectBadgeLeft
      : point.x,
  );
  const right = Math.max(
    point.x + mapRoomWidth,
    node.visits > 1
      ? point.x + mapRoomVisitBadgeRight
      : point.x + mapRoomWidth,
  );
  const top = Math.min(
    point.y,
    node.visits > 1 || node.mob_sightings.length > 0
      ? point.y + mapRoomBadgeTop
      : point.y,
  );
  const bottom = point.y + mapRoomHeight;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function truncateMapRoomTitle(title: string): string {
  let displayed = title.length > mapRoomTitleCharacterLimit
    ? `${title.slice(0, mapRoomTitleCharacterLimit - 1)}…`
    : title;
  while (
    displayed.length > 2
    && estimatedTitleWidth(displayed) + mapRoomTitleWidthBuffer
      > mapRoomTitleMaximumWidth
  ) {
    displayed = `${displayed.slice(0, -2)}…`;
  }
  return displayed;
}

function mapRoomTitleWidth(title: string): number {
  return Math.max(
    mapRoomWidth,
    Math.min(
      estimatedTitleWidth(truncateMapRoomTitle(title))
        + mapRoomTitleWidthBuffer,
      mapRoomTitleMaximumWidth,
    ),
  );
}

function estimatedTitleWidth(title: string): number {
  return [...title].reduce((width, character) => {
    if (character === " ") return width + 3;
    if (character === "…") return width + 10.5;
    if ("MW".includes(character)) return width + 9.5;
    if (/[A-Z0-9]/.test(character)) return width + 7;
    if ("mw".includes(character)) return width + 8.5;
    if ("iltfr".includes(character)) return width + 3.5;
    if (/[a-z]/.test(character)) return width + 5.8;
    return width + 4;
  }, 0);
}
