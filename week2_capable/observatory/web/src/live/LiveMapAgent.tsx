import {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  mapRoomHeight,
  mapRoomWidth,
  type MapPoint,
} from "./mapModel";
import { mapRoomEdge } from "./mapDrawing";

/** How long the agent takes to walk one link, from the mockup. */
export const agentTravelMilliseconds = 420;

type Props = {
  from: MapPoint | null;
  to: MapPoint | null;
  onPosition?: (point: MapPoint) => void;
  onArrival?: () => void;
};

/**
 * The agent, drawn as somebody walking rather than as a marker that jumps.
 *
 * It travels the link between two rooms, eased at both ends, and the link
 * lights up behind it as it goes. A marker that appears in its destination
 * says a room changed. One that walks says which way it went.
 */
export const LiveMapAgent = memo(function LiveMapAgent({
  from,
  to,
  onPosition,
  onArrival,
}: Props) {
  const [now, setNow] = useState(() => performance.now());
  const startedRef = useRef<number | null>(null);
  const travelling = from !== null && to !== null;

  useEffect(() => {
    if (!travelling) {
      startedRef.current = null;
      return;
    }
    startedRef.current = performance.now();
    let frame = 0;
    const tick = () => {
      const current = performance.now();
      setNow(current);
      if (
        startedRef.current !== null
        && current - startedRef.current < agentTravelMilliseconds
      ) {
        frame = requestAnimationFrame(tick);
      } else {
        onArrival?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from?.x, from?.y, onArrival, to?.x, to?.y, travelling]);

  if (to === null) return null;
  const centre = (point: MapPoint) => ({
    x: point.x + mapRoomWidth / 2,
    y: point.y + mapRoomHeight / 2,
  });
  const target = centre(to);
  if (!travelling || startedRef.current === null) {
    return (
      <LiveMapAgentFigure
        at={target}
        moving={false}
        facing={1}
        onPosition={onPosition}
      />
    );
  }

  const source = centre(from);
  const part = eased(Math.min(
    1,
    (now - startedRef.current) / agentTravelMilliseconds,
  ));
  const at = {
    x: source.x + (target.x - source.x) * part,
    y: source.y + (target.y - source.y) * part,
  };
  const start = mapRoomEdge(source, target);
  const stop = mapRoomEdge(target, source);
  return (
    <g className="live-map-agent-layer">
      <LiveMapAgentTrail start={start} stop={stop} at={at} />
      <LiveMapAgentFigure
        at={at}
        facing={target.x < source.x ? -1 : 1}
        moving={part < 1}
        now={now}
        onPosition={onPosition}
      />
    </g>
  );
});

/** Eased at both ends, so the camera following it has no corner to turn. */
function eased(part: number): number {
  return part * part * (3 - 2 * part);
}

/**
 * The link lighting up behind the agent, laid down at the pace of the walk.
 * Clamped by how far along the line the agent is, not by how far it is from
 * the start, because it leaves from the middle of a room and only reaches
 * the line at the room's edge.
 */
export function LiveMapAgentTrail({ start, stop, at }: {
  start: MapPoint;
  stop: MapPoint;
  at: MapPoint;
}) {
  const deltaX = stop.x - start.x;
  const deltaY = stop.y - start.y;
  const reach = deltaX * deltaX + deltaY * deltaY;
  if (reach === 0) return null;
  const along = ((at.x - start.x) * deltaX + (at.y - start.y) * deltaY) / reach;
  if (along <= 0.02) return null;
  const part = Math.min(1, along);
  return (
    <line
      className="live-map-agent-trail"
      x1={start.x}
      y1={start.y}
      x2={start.x + deltaX * part}
      y2={start.y + deltaY * part}
    />
  );
}

export function LiveMapAgentFigure({
  at,
  facing,
  moving,
  now = 0,
  onPosition,
  warp = 0,
}: {
  at: MapPoint;
  facing: number;
  moving: boolean;
  now?: number;
  onPosition?: (point: MapPoint) => void;
  warp?: number;
}) {
  useEffect(() => {
    onPosition?.(at);
  }, [at.x, at.y, onPosition]);
  const bob = moving ? Math.sin(now / 70) * 1.6 : 0;
  const shrink = 1 - 0.82 * warp;
  const spin = warp * 540;
  return (
    <g className={[
      "live-map-agent",
      warp > 0 ? "is-warping" : "",
    ].filter(Boolean).join(" ")}>
      <circle
        className="ring"
        cx={at.x}
        cy={at.y}
        opacity={(1 - warp) * 0.55}
        r={moving ? 15 : 13}
      />
      {warp <= 0 ? null : [0, 1, 2].map((index) => {
        const turn = Math.min(1, warp * (1 + index * 0.35));
        return (
          <circle
            className="ring is-warp"
            cx={at.x}
            cy={at.y}
            key={index}
            opacity={Math.min(1, warp * 1.4) * (0.85 - index * 0.22)}
            r={Math.max(0, (30 + index * 13) * (1 - turn * 0.72))}
            transform={`rotate(${spin + index * 40} ${at.x} ${at.y})`}
          />
        );
      })}
      <g
        className="figure"
        transform={[
          `translate(${at.x} ${at.y + bob})`,
          `rotate(${spin})`,
          `scale(${facing * shrink} ${shrink})`,
        ].join(" ")}
      >
        <circle cx="0" cy="-7" r="3.4" />
        <path
          d="M -3.4 -3 h 6.8 l 1.6 7 h -2.6 l -0.8 -3.4 l -0.6 3.4 h -2.8
             l -0.6 -3.4 l -0.8 3.4 h -2.6 z"
        />
      </g>
    </g>
  );
}
