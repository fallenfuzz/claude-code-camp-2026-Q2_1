import { memo } from "react";

import {
  border,
  type MapFloorFeatures,
  type MapHole,
  type MapStair,
} from "./mapFloorProjection";

type Props = MapFloorFeatures;

export const LiveMapFloorFeatures = memo(function LiveMapFloorFeatures({
  stairs,
  holes,
}: Props) {
  return (
    <g className="live-map-floor-features">
      {holes.map((hole) => <MapHoleShape hole={hole} key={hole.id} />)}
      {stairs.map((stair) => <MapStairShape key={stair.id} stair={stair} />)}
    </g>
  );
});

function MapHoleShape({ hole }: { hole: MapHole }) {
  const anchors = hole.ways.map(({ anchor }) => anchor);
  const lowX = Math.min(...anchors.map(({ x }) => x)) - 52;
  const highX = Math.max(...anchors.map(({ x }) => x)) + 52;
  const lowY = Math.min(...anchors.map(({ y }) => y)) - 17;
  const highY = Math.max(...anchors.map(({ y }) => y)) + 17;
  const middle = { x: (lowX + highX) / 2, y: (lowY + highY) / 2 };
  return (
    <g className={[
      "live-map-hole",
      hole.trap ? "is-trap" : "",
    ].filter(Boolean).join(" ")}>
      {hole.ways.map((way, index) => (
        <line
          className="live-map-hole-edge"
          key={`${hole.id}:way:${index}`}
          x1={way.leaves.x}
          x2={way.anchor.x}
          y1={way.leaves.y}
          y2={way.anchor.y}
        />
      ))}
      <rect
        className="live-map-hole-pod"
        height={highY - lowY}
        rx="18"
        width={highX - lowX}
        x={lowX}
        y={lowY}
      />
      <text className="live-map-hole-label" x={middle.x} y={middle.y - 2}>
        {hole.title} {hole.trap ? "✕" : "◦"}
      </text>
      {hole.trap ? (
        <text
          className="live-map-hole-label is-small"
          x={middle.x}
          y={middle.y + 12}
        >
          {hole.ways.length} ways in, none out
        </text>
      ) : null}
    </g>
  );
}

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
