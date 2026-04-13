// app/api/movement/route.ts
// Synthetic movement intelligence layer — globally applicable.
//
// Pattern-detection algorithms:
//   1. DBSCAN clustering   — finds high-density activity zones (haversine metric)
//   2. Directional analysis — convergence (toward) vs evacuation (away) per risk zone
//   3. Density anomaly      — compares observed activity to risk-weighted baseline
//   4. Cross-zone correlation — flags synchronized movement across multiple danger assets

import { NextResponse } from "next/server";
import type {
  MovementEvent,
  MovementCluster,
  MovementPattern,
  MovementResponse,
  RiskProximity,
  MovementType,
  PatternType,
  PatternSeverity,
} from "@/lib/types";

// ── Global asset seeds (must match sample_assets.json) ─────────────────────
const GLOBAL_ASSETS = [
  { id: "jakarta_cbd_subsidence",    name: "Jakarta CBD Subsidence Zone",       lat: -6.2146,  lng: 106.8451, risk: "dangerous",  riskScore: 94, type: "building" },
  { id: "chamoli_avalanche_scar",    name: "Chamoli Rock-Ice Avalanche Scar",   lat:  30.4672, lng:  79.5824, risk: "dangerous",  riskScore: 91, type: "slope"    },
  { id: "bosphorus_fsm_bridge",      name: "Bosphorus Bridge FSM",              lat:  41.0877, lng:  29.0564, risk: "concerning", riskScore: 67, type: "bridge"   },
  { id: "shanghai_pudong_subsidence",name: "Shanghai Pudong Tower District",    lat:  31.2397, lng: 121.4993, risk: "dangerous",  riskScore: 89, type: "building" },
  { id: "crescent_city_connection",  name: "Crescent City Connection Bridge",   lat:  29.9437, lng: -90.0674, risk: "concerning", riskScore: 68, type: "bridge"   },
  { id: "rainier_se_flank",          name: "Mount Rainier SE Flank",            lat:  46.8523, lng:-121.7267, risk: "concerning", riskScore: 72, type: "slope"    },
  { id: "victoria_island_lagos",     name: "Victoria Island Lagos",             lat:   6.4281, lng:   3.4219, risk: "concerning", riskScore: 65, type: "building" },
  { id: "thames_barrier_london",     name: "Thames Barrier Approach",           lat:  51.4989, lng:   0.0402, risk: "monitor",    riskScore: 34, type: "bridge"   },
  { id: "odaiba_tokyo",              name: "Odaiba Reclaimed Island",           lat:  35.6267, lng: 139.7750, risk: "monitor",    riskScore: 28, type: "building" },
  { id: "mexico_city_historic",      name: "Mexico City Historic Centre",       lat:  19.4326, lng: -99.1332, risk: "dangerous",  riskScore: 96, type: "building" },
] as const;

type AssetRecord = typeof GLOBAL_ASSETS[number];

// ── Deterministic pseudo-random (same approach as sar-image-generator) ──────
function seededRandom(seed: number, salt: number = 0): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── How many movement entities to spawn per asset ───────────────────────────
function countForRisk(risk: string): number {
  switch (risk) {
    case "dangerous":  return 6;
    case "concerning": return 4;
    case "monitor":    return 2;
    default:           return 1;
  }
}

// ── Haversine distance in km ─────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Generate synthetic movement events ──────────────────────────────────────
function generateEvents(timeWindow: number): MovementEvent[] {
  const events: MovementEvent[] = [];
  let idx = 0;

  for (const asset of GLOBAL_ASSETS) {
    const count = countForRisk(asset.risk);

    for (let i = 0; i < count; i++) {
      const seed = timeWindow * 1000 + idx;

      // Randomised position around asset centre
      const latOff = (seededRandom(seed, 1) - 0.5) * 0.014;
      const lngOff = (seededRandom(seed, 2) - 0.5) * 0.014;
      const lat = asset.lat + latOff;
      const lng = asset.lng + lngOff;

      // Proximity bucket by degree-distance (rough)
      const degDist = Math.sqrt(latOff ** 2 + lngOff ** 2);
      const riskProximity: RiskProximity =
        degDist < 0.003 ? "danger" : degDist < 0.008 ? "caution" : "safe";

      // Directional bias — dangerous zones: majority evacuate, minority converge
      const toCenterAngleDeg =
        Math.atan2(asset.lat - lat, asset.lng - lng) * (180 / Math.PI);
      const roll = seededRandom(seed, 5);
      let heading: number;
      if (asset.risk === "dangerous" && roll < 0.55) {
        // evacuation — heading away
        heading = ((toCenterAngleDeg + 180 + (seededRandom(seed, 6) - 0.5) * 50) % 360 + 360) % 360;
      } else if (asset.risk === "dangerous" && roll < 0.80) {
        // converging — first responders / inspectors
        heading = ((toCenterAngleDeg + (seededRandom(seed, 6) - 0.5) * 25) % 360 + 360) % 360;
      } else {
        // general traffic
        heading = seededRandom(seed, 7) * 360;
      }

      // Entity type distribution by asset type
      const typeRoll = seededRandom(seed, 8);
      let type: MovementType;
      if (asset.type === "bridge") {
        type = typeRoll < 0.72 ? "vehicle" : "person";
      } else if (asset.type === "slope") {
        type = typeRoll < 0.20 ? "vehicle" : typeRoll < 0.78 ? "person" : "group";
      } else {
        type = typeRoll < 0.50 ? "vehicle" : typeRoll < 0.88 ? "person" : "group";
      }

      const speed = type === "vehicle"
        ? Math.round(20 + seededRandom(seed, 9) * 80)
        : Math.round(2 + seededRandom(seed, 9) * 10);

      events.push({
        id: `ev_${asset.id}_${timeWindow}_${i}`,
        type,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000,
        heading: Math.round(heading),
        speed,
        nearAssetId: asset.id,
        nearAssetName: asset.name,
        riskProximity,
        timestamp: new Date().toISOString(),
        count: type === "group" ? Math.floor(2 + seededRandom(seed, 10) * 9) : undefined,
      });
      idx++;
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DETECTION ALGORITHMS
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. DBSCAN clustering — density-based spatial cluster analysis ────────────
// ε = 0.6 km, minPts = 2. Labels noise as standalone; clusters ≥ minPts.
function dbscanClusters(events: MovementEvent[]): MovementCluster[] {
  const EPSILON_KM = 0.6;
  const MIN_PTS = 2;

  const visited = new Set<string>();
  const inCluster = new Set<string>();
  const clusters: MovementCluster[] = [];

  for (const evt of events) {
    if (visited.has(evt.id)) continue;
    visited.add(evt.id);

    const neighbors = events.filter(
      (e) => e.id !== evt.id && haversineKm(evt.lat, evt.lng, e.lat, e.lng) <= EPSILON_KM
    );

    if (neighbors.length + 1 < MIN_PTS) continue; // noise point

    // Core point — expand cluster
    const cluster: MovementEvent[] = [evt];
    const queue = [...neighbors];

    while (queue.length) {
      const current = queue.shift()!;
      if (!visited.has(current.id)) {
        visited.add(current.id);
        const nn = events.filter(
          (e) => !cluster.some((c) => c.id === e.id) &&
                 haversineKm(current.lat, current.lng, e.lat, e.lng) <= EPSILON_KM
        );
        if (nn.length + 1 >= MIN_PTS) queue.push(...nn);
      }
      if (!inCluster.has(current.id)) {
        cluster.push(current);
        inCluster.add(current.id);
      }
    }
    inCluster.add(evt.id);

    const centerLat = cluster.reduce((s, e) => s + e.lat, 0) / cluster.length;
    const centerLng = cluster.reduce((s, e) => s + e.lng, 0) / cluster.length;
    const risk: RiskProximity =
      cluster.some((e) => e.riskProximity === "danger") ? "danger" :
      cluster.some((e) => e.riskProximity === "caution") ? "caution" : "safe";

    // Dominant asset: most common nearAssetId
    const assetCounts: Record<string, number> = {};
    cluster.forEach((e) => { assetCounts[e.nearAssetId] = (assetCounts[e.nearAssetId] ?? 0) + 1; });
    const nearAssetId = Object.entries(assetCounts).sort((a, b) => b[1] - a[1])[0][0];

    clusters.push({
      id: `cluster_${clusters.length}`,
      centerLat: Math.round(centerLat * 100000) / 100000,
      centerLng: Math.round(centerLng * 100000) / 100000,
      count: cluster.length,
      nearAssetId,
      risk,
    });
  }

  return clusters;
}

// ── 2. Directional convergence / evacuation analysis ────────────────────────
// For each asset, compute the proportion of entities heading toward vs away.
// Uses circular angle arithmetic to handle 0°/360° wraparound correctly.
function detectDirectionalPatterns(
  events: MovementEvent[],
  assets: readonly AssetRecord[]
): MovementPattern[] {
  const patterns: MovementPattern[] = [];

  for (const asset of assets) {
    const assetEvts = events.filter((e) => e.nearAssetId === asset.id);
    if (assetEvts.length < 2) continue;

    const analysis = assetEvts.map((evt) => {
      // Angle pointing FROM this event's position TO the asset centre
      const toAssetRaw = Math.atan2(asset.lat - evt.lat, asset.lng - evt.lng) * (180 / Math.PI);
      const toAsset = ((toAssetRaw % 360) + 360) % 360;
      const heading = ((evt.heading % 360) + 360) % 360;

      // Angular difference (always 0–180)
      let diff = Math.abs(toAsset - heading);
      if (diff > 180) diff = 360 - diff;

      return { converging: diff < 45, diverging: diff > 135 };
    });

    const total = assetEvts.length;
    const nConverge = analysis.filter((d) => d.converging).length;
    const nDiverge  = analysis.filter((d) => d.diverging).length;

    if (nConverge / total > 0.50 && (asset.risk === "dangerous" || asset.risk === "concerning")) {
      const severity: PatternSeverity = asset.risk === "dangerous" ? "critical" : "warning";
      patterns.push({
        type: "convergence" as PatternType,
        assetId: asset.id,
        assetName: asset.name,
        description: `${nConverge}/${total} entities converging on ${asset.risk.toUpperCase()} zone — possible emergency response or unaware approach`,
        severity,
        eventCount: nConverge,
        confidence: Math.round((nConverge / total) * 100) / 100,
      });
    } else if (nDiverge / total > 0.60 && (asset.risk === "dangerous" || asset.risk === "concerning")) {
      const severity: PatternSeverity = asset.risk === "dangerous" ? "warning" : "info";
      patterns.push({
        type: "evacuation" as PatternType,
        assetId: asset.id,
        assetName: asset.name,
        description: `${nDiverge}/${total} entities diverging from zone — precautionary dispersal or evacuation signal`,
        severity,
        eventCount: nDiverge,
        confidence: Math.round((nDiverge / total) * 100) / 100,
      });
    }
  }
  return patterns;
}

// ── 3. Density anomaly detection ────────────────────────────────────────────
// Compares entities-in-danger-zone count to risk-weighted baseline.
// Dangerous zones should see lower activity (people keep away) → excess = anomaly.
function detectDensityAnomalies(
  events: MovementEvent[],
  assets: readonly AssetRecord[]
): MovementPattern[] {
  const patterns: MovementPattern[] = [];

  for (const asset of assets) {
    const nearDanger = events.filter(
      (e) => e.nearAssetId === asset.id && e.riskProximity === "danger"
    ).length;

    // Expected baseline: dangerous=1.5, concerning=2.5, monitor=3.5, stable=5
    const baseline =
      asset.risk === "dangerous" ? 1.5 :
      asset.risk === "concerning" ? 2.5 :
      asset.risk === "monitor" ? 3.5 : 5;

    if (nearDanger >= baseline * 2.2) {
      const ratio = Math.round((nearDanger / baseline) * 10) / 10;
      const severity: PatternSeverity = asset.risk === "dangerous" ? "critical" : "warning";
      patterns.push({
        type: "density_anomaly" as PatternType,
        assetId: asset.id,
        assetName: asset.name,
        description: `Anomalous activity density: ${nearDanger} entities in danger zone (${ratio}× expected baseline of ${baseline})`,
        severity,
        eventCount: nearDanger,
        confidence: Math.min(0.95, Math.round(((nearDanger - baseline) / (baseline * 3)) * 100) / 100),
      });
    }
  }
  return patterns;
}

// ── 4. Cluster-derived patterns (critical clusters near danger zones) ─────────
function clusterPatterns(
  clusters: MovementCluster[],
  assets: readonly AssetRecord[]
): MovementPattern[] {
  return clusters
    .filter((c) => c.count >= 3)
    .map((c) => {
      const asset = assets.find((a) => a.id === c.nearAssetId);
      const severity: PatternSeverity =
        c.risk === "danger" ? "critical" : c.risk === "caution" ? "warning" : "info";
      return {
        type: "cluster" as PatternType,
        assetId: c.nearAssetId,
        assetName: asset?.name ?? c.nearAssetId,
        description: `DBSCAN cluster: ${c.count} entities within 600m radius at ${c.risk} proximity`,
        severity,
        eventCount: c.count,
        confidence: Math.min(0.90, Math.round((c.count / 8) * 100) / 100),
      };
    });
}

// ── 5. Cross-zone correlation — are multiple danger zones active together? ────
function detectCrossZoneCorrelation(
  events: MovementEvent[],
  assets: readonly AssetRecord[]
): MovementPattern[] {
  const dangerAssetsWithActivity = assets.filter((a) => {
    if (a.risk !== "dangerous") return false;
    return events.some((e) => e.nearAssetId === a.id && e.riskProximity !== "safe");
  });

  if (dangerAssetsWithActivity.length >= 3) {
    return [{
      type: "density_anomaly" as PatternType,
      assetId: "multi_zone",
      assetName: "Multi-Zone Alert",
      description: `Simultaneous activity detected near ${dangerAssetsWithActivity.length} DANGEROUS zones globally — elevated multi-site risk posture`,
      severity: "critical",
      eventCount: dangerAssetsWithActivity.length,
      confidence: 0.80,
    }];
  }
  return [];
}

// ── GET /api/movement ─────────────────────────────────────────────────────────
export async function GET() {
  const t0 = Date.now();

  try {
  // 5-second time window ensures positions refresh every 5 s (live simulation)
  const timeWindow = Math.floor(Date.now() / 5000);

  // 1. Generate events
  const events = generateEvents(timeWindow);

  // 2. Run DBSCAN clustering
  const clusters = dbscanClusters(events);

  // 3. Detect all patterns
  const directional = detectDirectionalPatterns(events, GLOBAL_ASSETS);
  const density     = detectDensityAnomalies(events, GLOBAL_ASSETS);
  const clust       = clusterPatterns(clusters, GLOBAL_ASSETS);
  const crossZone   = detectCrossZoneCorrelation(events, GLOBAL_ASSETS);

  // Merge, deduplicate by assetId+type, sort by severity
  const severityRank: Record<PatternSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const allPatterns: MovementPattern[] = [...directional, ...density, ...clust, ...crossZone]
    .filter((p, i, arr) => arr.findIndex((q) => q.assetId === p.assetId && q.type === p.type) === i)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const dangerZoneEvents = events.filter((e) => e.riskProximity === "danger").length;

  const analysisMs = Date.now() - t0;
  console.info(
    `[movement] events=${events.length} clusters=${clusters.length} patterns=${allPatterns.length} danger=${dangerZoneEvents} ms=${analysisMs}`
  );

  const response: MovementResponse = {
    events,
    clusters,
    patterns: allPatterns,
    summary: {
      totalEvents: events.length,
      dangerZoneEvents,
      patternCount: allPatterns.length,
      timestamp: new Date().toISOString(),
      analysisMs,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[movement] Analysis failed: ${msg}`);
    return NextResponse.json({ error: "Movement analysis failed", detail: msg }, { status: 500 });
  }
}
