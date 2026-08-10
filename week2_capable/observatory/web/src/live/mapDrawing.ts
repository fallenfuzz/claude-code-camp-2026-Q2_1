import {
  mapRoomHeight,
  mapRoomWidth,
  type MapPoint,
} from "./mapModel";

/** Return the exact point where a centre-to-centre line meets a room box. */
export function mapRoomEdge(from: MapPoint, to: MapPoint): MapPoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (deltaX === 0 && deltaY === 0) return from;
  const scale = Math.min(
    Math.abs(deltaX) > 0.001
      ? Math.abs((mapRoomWidth / 2) / deltaX)
      : Infinity,
    Math.abs(deltaY) > 0.001
      ? Math.abs((mapRoomHeight / 2) / deltaY)
      : Infinity,
  );
  return {
    x: from.x + deltaX * scale,
    y: from.y + deltaY * scale,
  };
}

export function mapBentPath(source: MapPoint, target: MapPoint): string {
  const bow = Math.hypot(target.x - source.x, target.y - source.y) * 0.16 + 10;
  const middleX = (source.x + target.x) / 2;
  const middleY = (source.y + target.y) / 2;
  const straightDown = source.x === target.x;
  return [
    `M ${source.x} ${source.y}`,
    `Q ${middleX + (straightDown ? bow : 0)}`,
    `${middleY + (straightDown ? 0 : bow)} ${target.x} ${target.y}`,
  ].join(" ");
}
