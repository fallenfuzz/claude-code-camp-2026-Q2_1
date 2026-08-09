import {
  useEffect,
  useState,
} from "react";

import {
  emptyRoomLayout,
  loadRoomLayout,
  type RoomLayout,
} from "./roomLayout";

/**
 * The world's saved squares, fetched once for the life of the page.
 *
 * Until it arrives the map draws itself the way it always did, so a slow
 * or missing file costs a reflow rather than an empty screen.
 */
export function useRoomLayout(): RoomLayout {
  const [world, setWorld] = useState<RoomLayout>(emptyRoomLayout);
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
