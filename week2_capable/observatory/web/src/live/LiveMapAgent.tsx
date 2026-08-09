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

/** How long the agent takes to walk one link, from the mockup. */
export const agentTravelMilliseconds = 420;

type Props = {
  from: MapPoint | null;
  to: MapPoint | null;
};

/**
 * The agent, drawn as somebody walking rather than as a marker that jumps.
 *
 * It travels the link between two rooms, eased at both ends, and the link
 * lights up behind it as it goes. A marker that appears in its destination
 * says a room changed. One that walks says which way it went.
 */
export const LiveMapAgent = memo(function LiveMapAgent({ from, to }: Props) {
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
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from?.x, from?.y, to?.x, to?.y, travelling]);

  if (to === null) return null;
  const centre = (point: MapPoint) => ({
    x: point.x + mapRoomWidth / 2,
    y: point.y + mapRoomHeight / 2,
  });
  const target = centre(to);
  if (!travelling || startedRef.current === null) {
    return <AgentFigure at={target} moving={false} facing={1} />;
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
  const start = roomEdge(source, target);
  const stop = roomEdge(target, source);
  return (
    <g className="live-map-agent-layer">
      <AgentTrail start={start} stop={stop} at={at} />
      <AgentFigure
        at={at}
        facing={target.x < source.x ? -1 : 1}
        moving={part < 1}
        now={now}
      />
    </g>
  );
});

/** Eased at both ends, so the camera following it has no corner to turn. */
function eased(part: number): number {
  return part * part * (3 - 2 * part);
}

/** Where a line between two room centres leaves the first room's box. */
function roomEdge(from: MapPoint, to: MapPoint): MapPoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (deltaX === 0 && deltaY === 0) return from;
  const half = { x: mapRoomWidth / 2 + 2, y: mapRoomHeight / 2 + 2 };
  const scale = Math.min(
    Math.abs(deltaX) > 0.001 ? Math.abs(half.x / deltaX) : Infinity,
    Math.abs(deltaY) > 0.001 ? Math.abs(half.y / deltaY) : Infinity,
  );
  return { x: from.x + deltaX * scale, y: from.y + deltaY * scale };
}

/**
 * The link lighting up behind the agent, laid down at the pace of the walk.
 * Clamped by how far along the line the agent is, not by how far it is from
 * the start, because it leaves from the middle of a room and only reaches
 * the line at the room's edge.
 */
function AgentTrail({ start, stop, at }: {
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

function AgentFigure({ at, facing, moving, now = 0 }: {
  at: MapPoint;
  facing: number;
  moving: boolean;
  now?: number;
}) {
  const bob = moving ? Math.sin(now / 70) * 1.6 : 0;
  return (
    <g className="live-map-agent">
      <circle className="ring" cx={at.x} cy={at.y} r={moving ? 15 : 13} />
      <g
        className="figure"
        transform={`translate(${at.x} ${at.y + bob}) scale(${facing} 1)`}
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
