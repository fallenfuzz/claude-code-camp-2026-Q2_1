import {
  forgetRoomLayout,
  loadRoomLayout,
} from "./roomLayout";

type LayoutFile = {
  rooms: Record<string, [number, number, number, number]>;
  arcs: Array<[number, string, number]>;
};

/**
 * The saved world map a test runs against.
 *
 * The app ships the layout as a file and draws nothing without it, so a test
 * that renders the map has to supply one. Priming the loader rather than the
 * global fetch keeps the world map out of every unrelated request mock.
 */
export function primeRoomLayout(file: LayoutFile): void {
  forgetRoomLayout();
  loadRoomLayout((async () => ({
    ok: true,
    json: async () => file,
  })) as unknown as typeof fetch);
}
