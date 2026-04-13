"use client";

// hooks/useAISStream.ts
// Live AIS vessel tracking via aisstream.io WebSocket.
// Free API key from https://aisstream.io/
//
// Message flow:
//   subscribe → PositionReport (lat/lng/speed/heading per vessel)
//              + ShipStaticData (name/type per MMSI, less frequent)
//
// State: Map<MMSI, Vessel> — updated in-place, React state copy on each batch
// Batching: accumulates WebSocket messages, flushes to React state every 500ms
//           to avoid triggering 100+ re-renders per second on busy channels

import { useEffect, useRef, useState, useCallback } from "react";

export interface AISVessel {
  mmsi: number;
  name: string;
  lat: number;
  lng: number;
  sog: number;        // speed over ground (knots)
  cog: number;        // course over ground (degrees)
  heading: number;    // true heading (degrees, 511=unavailable)
  navStatus: number;  // 0=underway, 1=anchored, 5=moored, etc.
  vesselType: number; // AIS ship type code
  length: number;     // metres
  updatedAt: string;  // ISO timestamp
}

// AIS ship type → readable category
export function vesselCategory(type: number): "cargo" | "tanker" | "passenger" | "tug" | "fishing" | "naval" | "other" {
  if (type >= 70 && type <= 79) return "cargo";
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 60 && type <= 69) return "passenger";
  if (type >= 50 && type <= 59) return "tug";
  if (type >= 30 && type <= 39) return "fishing";
  if (type === 35 || type === 36) return "naval";
  return "other";
}

interface UseAISStreamOptions {
  enabled: boolean;
  /** Global bounding box by default; pass to restrict to region */
  bbox?: [[number, number], [number, number]]; // [[minLat,minLng],[maxLat,maxLng]]
  /** Max vessels to track (oldest dropped when exceeded) */
  maxVessels?: number;
  /** Stale vessel timeout in ms — vessel removed if not updated (default 5min) */
  staleTtlMs?: number;
}

interface UseAISStreamResult {
  vessels: AISVessel[];
  connected: boolean;
  error: string | null;
  stats: { total: number; moving: number; messageRate: number };
}

const WS_URL = "wss://stream.aisstream.io/v0/stream";
const BATCH_FLUSH_MS = 500;
const DEFAULT_MAX_VESSELS = 2000;
const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes

export function useAISStream({
  enabled,
  bbox = [[-90, -180], [90, 180]],
  maxVessels = DEFAULT_MAX_VESSELS,
  staleTtlMs = DEFAULT_STALE_MS,
}: UseAISStreamOptions): UseAISStreamResult {
  const [vessels, setVessels] = useState<AISVessel[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, moving: 0, messageRate: 0 });

  // Internal mutable state — not React state (no re-render on every message)
  const vesselMap = useRef<Map<number, AISVessel>>(new Map());
  const pendingFlush = useRef(false);
  const msgCountRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

  const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY;

  const flushToReact = useCallback(() => {
    if (!pendingFlush.current) return;
    pendingFlush.current = false;
    const arr = Array.from(vesselMap.current.values());
    setVessels(arr);
    setStats({
      total: arr.length,
      moving: arr.filter(v => v.sog > 0.5 && v.navStatus !== 1 && v.navStatus !== 5).length,
      messageRate: msgCountRef.current,
    });
    msgCountRef.current = 0;
  }, []);

  const connect = useCallback(() => {
    if (!apiKey || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectDelay.current = 1000;

      // Subscribe with bounding box + message type filter
      // Verified: key is "APIKey" (capital K), not "APIkey"
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [bbox],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as AISMessage;
        processMessage(msg);
        msgCountRef.current++;
        pendingFlush.current = true;
      } catch { /* malformed message, skip */ }
    };

    ws.onerror = () => {
      setError("AIS stream connection error");
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (enabled) {
        // Exponential backoff reconnect (max 30s)
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          connect();
        }, reconnectDelay.current);
      }
    };
  }, [apiKey, enabled, bbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const processMessage = (msg: AISMessage) => {
    // Verified: aisstream.io uses "Metadata" (not "MetaData") in responses
    const meta = msg.Metadata ?? msg.MetaData;
    const mmsi = meta?.MMSI;
    if (!mmsi) return;

    if (msg.MessageType === "PositionReport") {
      const pos = msg.Message?.PositionReport;
      if (!pos) return;

      const existing = vesselMap.current.get(mmsi);
      const vessel: AISVessel = {
        mmsi,
        name: meta?.ShipName?.trim() ?? existing?.name ?? `MMSI ${mmsi}`,
        lat: pos.Latitude ?? meta?.latitude ?? existing?.lat ?? 0,
        lng: pos.Longitude ?? meta?.longitude ?? existing?.lng ?? 0,
        sog: pos.Sog ?? existing?.sog ?? 0,
        cog: pos.Cog ?? existing?.cog ?? 0,
        heading: pos.TrueHeading ?? existing?.heading ?? 511,
        navStatus: pos.NavigationalStatus ?? existing?.navStatus ?? 0,
        vesselType: existing?.vesselType ?? 0,
        length: existing?.length ?? 0,
        updatedAt: new Date().toISOString(),
      };

      vesselMap.current.set(mmsi, vessel);

      // Evict oldest entries if over limit
      if (vesselMap.current.size > maxVessels) {
        const oldest = Array.from(vesselMap.current.entries())
          .sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))
          .slice(0, vesselMap.current.size - maxVessels);
        oldest.forEach(([k]) => vesselMap.current.delete(k));
      }
    }

    if (msg.MessageType === "ShipStaticData") {
      const stat = msg.Message?.ShipStaticData;
      if (!stat) return;
      const existing = vesselMap.current.get(mmsi);
      if (existing) {
        vesselMap.current.set(mmsi, {
          ...existing,
          name: stat.Name?.trim() || meta?.ShipName?.trim() || existing.name,
          vesselType: stat.Type ?? existing.vesselType,
          length: (stat.Dimension?.A ?? 0) + (stat.Dimension?.B ?? 0),
        });
      }
    }
  };

  // Lifecycle
  useEffect(() => {
    if (!enabled || !apiKey) {
      if (apiKey === undefined) setError("NEXT_PUBLIC_AISSTREAM_API_KEY not set — add to .env.local");
      return;
    }

    connect();

    // Batch flush to React state
    flushTimer.current = setInterval(flushToReact, BATCH_FLUSH_MS);

    // Remove stale vessels
    staleTimer.current = setInterval(() => {
      const cutoff = new Date(Date.now() - staleTtlMs).toISOString();
      for (const [mmsi, v] of vesselMap.current) {
        if (v.updatedAt < cutoff) vesselMap.current.delete(mmsi);
      }
    }, 60000);

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (flushTimer.current) clearInterval(flushTimer.current);
      if (staleTimer.current) clearInterval(staleTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      vesselMap.current.clear();
      setVessels([]);
      setConnected(false);
    };
  }, [enabled, apiKey, connect, flushToReact, staleTtlMs]);

  return { vessels, connected, error, stats };
}

// ── aisstream.io message types ────────────────────────────────────────────────
// Verified 2026-04: field is "Metadata" (capital M, lowercase d)
// Accept both casings for resilience against API version changes
interface AISMetadata {
  MMSI: number;
  ShipName?: string;
  latitude?: number;
  longitude?: number;
  time_utc?: string;
}

interface AISMessage {
  MessageType: "PositionReport" | "ShipStaticData" | string;
  /** Correct capitalisation per aisstream.io v0 API */
  Metadata?: AISMetadata;
  /** Legacy / alternative capitalisation — keep for robustness */
  MetaData?: AISMetadata;
  Message?: {
    PositionReport?: {
      Latitude: number;
      Longitude: number;
      Sog: number;
      Cog: number;
      TrueHeading: number;
      NavigationalStatus: number;
    };
    ShipStaticData?: {
      Name?: string;
      Type?: number;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
      Draught?: number;
    };
  };
}
