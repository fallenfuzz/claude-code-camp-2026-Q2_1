import { memo } from "react";

import {
  border,
  type MapFloorFeatures,
  type MapStair,
} from "./mapFloorProjection";

type Props = MapFloorFeatures;

export const LiveMapFloorFeatures = memo(function LiveMapFloorFeatures({
  stairs,
}: Props) {
  return (
    <g className="live-map-floor-features">
      {stairs.map((stair) => <MapStairShape key={stair.id} stair={stair} />)}
    </g>
  );
});

function MapStairShape({ stair }: { stair: MapStair }) {
  const corner = border(stair.at, stair.disc);
  const reach = Math.hypot(
    stair.disc.x - corner.x,
    stair.disc.y - corner.y,
  );
  const pull = reach === 0
    ? { x: 0, y: 0 }
    : {
        x: (stair.disc.x - corner.x) / reach * 17,
        y: (stair.disc.y - corner.y) / reach * 17,
      };
  const classes = [
    "live-map-stair",
    `is-${stair.way}`,
    stair.dim ? "is-dim" : "",
    stair.arrival ? "is-arrival" : "",
  ].filter(Boolean).join(" ");
  return (
    <g className={classes} data-source={stair.source}>
      <path
        className="live-map-stair-tether"
        d={[
          `M ${corner.x} ${corner.y}`,
          `L ${stair.disc.x - pull.x} ${stair.disc.y - pull.y}`,
        ].join(" ")}
      />
      <circle
        className="live-map-stair-disc"
        cx={stair.disc.x}
        cy={stair.disc.y}
        r="17"
      />
      <text
        className="live-map-stair-glyph"
        x={stair.disc.x}
        y={stair.disc.y + 3}
      >
        {stair.way === "up" ? "▲" : "▼"}
      </text>
      {stair.barred ? (
        <line
          className="live-map-stair-barred"
          x1={stair.disc.x - 12}
          x2={stair.disc.x + 12}
          y1={stair.disc.y + 12}
          y2={stair.disc.y - 12}
        />
      ) : null}
      <text
        className="live-map-stair-floor"
        x={stair.disc.x}
        y={stair.disc.y + 28}
      >
        {stair.targetFloor === null
          ? `#${stair.targetVnum ?? "?"}`
          : `level ${stair.targetFloor + 1}`}
      </text>
    </g>
  );
}
