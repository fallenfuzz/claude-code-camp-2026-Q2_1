import {
  useEffect,
  useState,
} from "react";

import {
  LiveMapAgentFigure,
  LiveMapAgentTrail,
} from "./LiveMapAgent";
import { mapRoomEdge } from "./mapDrawing";
import type { MapPoint } from "./mapModel";

export const floorWarpLegMilliseconds = 340;
export const floorWarpMilliseconds = 340;
export const floorWarpHoldMilliseconds = 160;
export const floorSwapMilliseconds = 240;

export type FloorWarpPhase =
  | "walk-out"
  | "warp-out"
  | "floor-leaving"
  | "warp-in"
  | "walk-in";

export type FloorWarpDrawing = {
  phase: FloorWarpPhase;
  phaseStarted: number;
  direction: "up" | "down";
  leavingRoom: MapPoint;
  leavingDisc: MapPoint;
  arrivingDisc: MapPoint;
  arrivingRoom: MapPoint;
};

export function LiveMapFloorWarp({
  drawing,
  onPosition,
}: {
  drawing: FloorWarpDrawing;
  onPosition?: (point: MapPoint) => void;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drawing.phase, drawing.phaseStarted]);

  const elapsed = Math.max(0, now - drawing.phaseStarted);
  if (drawing.phase === "walk-out") {
    return (
      <WalkingLeg
        from={drawing.leavingRoom}
        now={now}
        onPosition={onPosition}
        outgoing
        part={elapsed / floorWarpLegMilliseconds}
        to={drawing.leavingDisc}
      />
    );
  }
  if (drawing.phase === "walk-in") {
    return (
      <WalkingLeg
        from={drawing.arrivingDisc}
        now={now}
        onPosition={onPosition}
        outgoing={false}
        part={elapsed / floorWarpLegMilliseconds}
        to={drawing.arrivingRoom}
      />
    );
  }
  const at = drawing.phase === "warp-in"
    ? drawing.arrivingDisc
    : drawing.leavingDisc;
  const progress = Math.min(1, elapsed / floorWarpMilliseconds);
  const warp = drawing.phase === "warp-in" ? 1 - progress : 1;
  return (
    <LiveMapAgentFigure
      at={at}
      facing={1}
      moving={false}
      now={now}
      onPosition={onPosition}
      warp={drawing.phase === "warp-out" ? progress : warp}
    />
  );
}

function WalkingLeg({
  from,
  now,
  onPosition,
  outgoing,
  part: rawPart,
  to,
}: {
  from: MapPoint;
  now: number;
  onPosition?: (point: MapPoint) => void;
  outgoing: boolean;
  part: number;
  to: MapPoint;
}) {
  const part = ease(Math.min(1, Math.max(0, rawPart)));
  const at = {
    x: from.x + (to.x - from.x) * part,
    y: from.y + (to.y - from.y) * part,
  };
  const trailStart = outgoing
    ? mapRoomEdge(from, to)
    : short(from, to, 17);
  const trailStop = outgoing
    ? short(to, from, 17)
    : mapRoomEdge(to, from);
  return (
    <g className="live-map-floor-warp-leg">
      <LiveMapAgentTrail start={trailStart} stop={trailStop} at={at} />
      <LiveMapAgentFigure
        at={at}
        facing={to.x < from.x ? -1 : 1}
        moving={part < 1}
        now={now}
        onPosition={onPosition}
      />
    </g>
  );
}

function ease(part: number): number {
  return part * part * (3 - 2 * part);
}

function short(point: MapPoint, towards: MapPoint, by: number): MapPoint {
  const span = Math.hypot(towards.x - point.x, towards.y - point.y);
  if (span === 0 || by === 0) return point;
  return {
    x: point.x + ((towards.x - point.x) / span) * by,
    y: point.y + ((towards.y - point.y) / span) * by,
  };
}
