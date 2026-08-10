import type { MapConnection, MapRoom } from "./mapModel";
import type { MapGhostLink } from "./mapGhostProjection";

/**
 * The retained journey says whether a link was walked. The world map says
 * whether that fixed-floor link is one-way, straight, or needs a hop.
 */
export function projectMapConnections(
  connections: MapConnection[],
  rooms: MapRoom[],
  gameLinks: MapGhostLink[],
): MapConnection[] {
  const vnumById = new Map(rooms.flatMap(({ node }) => {
    const vnum = node.atlas?.vnum;
    return vnum === undefined ? [] : [[node.id, vnum] as const];
  }));
  const gameByPair = new Map(gameLinks.map((link) => [
    pairKey(link.source.vnum, link.target.vnum),
    link,
  ]));

  return connections.map((connection) => {
    const source = vnumById.get(connection.source);
    const target = vnumById.get(connection.target);
    if (source === undefined || target === undefined) return connection;
    const game = gameByPair.get(pairKey(source, target));
    if (game === undefined) return connection;
    return {
      ...connection,
      bent: false,
      displacement: false,
      hop: game.hop,
      oneWay: game.oneWay,
      vertical: false,
    };
  });
}

function pairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}
