import {
  useEffect,
  useState,
} from "react";

import type {
  AtlasNode,
  AtlasProjection,
} from "../contracts";

const pending = new Map<number, Promise<AtlasNode[]>>();

export function loadAtlasZone(
  zone: number,
  fetcher: typeof fetch = fetch,
): Promise<AtlasNode[]> {
  const existing = pending.get(zone);
  if (existing !== undefined) return existing;
  const request = fetcher(
    `/api/world/atlas?level=zone&zone=${encodeURIComponent(zone)}`,
    { cache: "force-cache" },
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`atlas ${response.status}`);
      const projection = await response.json() as AtlasProjection;
      return projection.available ? projection.nodes : [];
    })
    .catch(() => []);
  pending.set(zone, request);
  return request;
}

export function useAtlasZone(zone: number | null): AtlasNode[] {
  const [nodes, setNodes] = useState<AtlasNode[]>([]);
  useEffect(() => {
    if (zone === null) {
      setNodes([]);
      return;
    }
    let watching = true;
    loadAtlasZone(zone).then((loaded) => {
      if (watching) setNodes(loaded);
    });
    return () => {
      watching = false;
    };
  }, [zone]);
  return nodes;
}

export function forgetAtlasZones(): void {
  pending.clear();
}
