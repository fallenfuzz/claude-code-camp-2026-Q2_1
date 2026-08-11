import { memo } from "react";

import {
  mapColumnGap,
  mapRoomHeight,
  mapRoomWidth,
  mapRowGap,
  type MapPoint,
} from "./mapModel";
import { mapBentPath, mapRoomEdge } from "./mapDrawing";
import type { MapGhostProjection } from "./mapGhostProjection";
import { truncateMapRoomTitle } from "./mapRoomFootprint";

type Props = MapGhostProjection;

export const LiveMapGhosts = memo(function LiveMapGhosts({
  links,
  rooms,
}: Props) {
  if (rooms.length === 0 && links.length === 0) return null;
  return (
    <g className="live-map-ghost-layer" aria-hidden="true">
      <g className="live-map-ghost-links">
        {links.map((link) => {
          const from = center(link.source);
          const to = center(link.target);
          const start = mapRoomEdge(from, to);
          const end = mapRoomEdge(to, from);
          return (
            <path
              className={[
                "live-map-ghost-link",
                link.hop ? "is-hop" : "",
              ].filter(Boolean).join(" ")}
              d={link.hop
                ? mapBentPath(start, end)
                : `M ${start.x} ${start.y} L ${end.x} ${end.y}`}
              key={link.id}
              markerEnd={link.oneWay
                ? "url(#live-map-one-way-tip)"
                : undefined}
            />
          );
        })}
      </g>
      <g className="live-map-ghost-rooms">
        {rooms.map(({ atlas, sighted, square }) => {
          const x = square.x * mapColumnGap;
          const y = square.y * mapRowGap;
          return (
            <g
              className={[
                "live-map-ghost",
                sighted ? "is-sighted" : "",
              ].filter(Boolean).join(" ")}
              key={square.vnum}
              transform={`translate(${x} ${y})`}
            >
              <rect
                height={mapRoomHeight}
                rx="8"
                width={mapRoomWidth}
              />
              {sighted && atlas !== null ? (
                <>
                  <text className="live-map-ghost-title" x="12" y="21">
                    {truncateMapRoomTitle(atlas.title)}
                  </text>
                  <text className="live-map-ghost-vnum" x="12" y="35">
                    #{atlas.vnum}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </g>
    </g>
  );
});

function center(square: { x: number; y: number }): MapPoint {
  return {
    x: square.x * mapColumnGap + mapRoomWidth / 2,
    y: square.y * mapRowGap + mapRoomHeight / 2,
  };
}
