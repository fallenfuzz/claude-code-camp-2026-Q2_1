import {
  useEffect,
  useState,
} from "react";

import {
  loadRoomLayout,
  type RoomLayout,
} from "./roomLayout";

/**
 * The world's saved squares, fetched once for the life of the page.
 *
 * Until it arrives the map waits. Falling back to a computed layout would
 * briefly move every room and contradict the fixed world map.
 */
export function useRoomLayout(): RoomLayout | null {
  const [world, setWorld] = useState<RoomLayout | null>(null);
  useEffect(() => {
    let watching = true;
    loadRoomLayout().then((loaded) => {
      if (watching) setWorld(loaded);
    });
    return () => {
      watching = false;
    };
  }, []);
  return world;
}
