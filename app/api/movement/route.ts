// app/api/movement/route.ts
// Global movement intelligence — ~400 entities across 100+ monitored locations.
//
// Pattern-detection algorithms:
//   1. DBSCAN clustering   — haversine distance, ε=0.6km, minPts=2
//   2. Convergence/Evacuation — directional circular statistics per risk zone
//   3. Density anomaly     — observed vs risk-weighted expected baseline
//   4. Cross-zone correlation — simultaneous multi-zone activity flag
//   5. Convoy detection    — 3+ military vehicles in tight formation
//   6. Dark zone           — AIS-silent military zone detection

import { NextResponse } from "next/server";
import type {
  MovementEvent, MovementCluster, MovementPattern,
  MovementResponse, RiskProximity, MovementType,
  PatternType, PatternSeverity,
} from "@/lib/types";

// ── Monitoring zones — 100 global locations ──────────────────────────────────
// density = events per 5-second window
const MONITORING_ZONES = [
  // ── PRIMARY SAR RISK ASSETS (high density — these are actively monitored) ──
  { id: "jakarta_cbd_subsidence",    name: "Jakarta CBD Subsidence",       lat: -6.2146, lng: 106.8451, risk: "dangerous",  type: "building", density: 7 },
  { id: "mexico_city_historic",      name: "Mexico City Historic Centre",  lat: 19.4326, lng: -99.1332, risk: "dangerous",  type: "building", density: 7 },
  { id: "shanghai_pudong_subsidence",name: "Shanghai Pudong Tower Dist.",  lat: 31.2397, lng: 121.4993, risk: "dangerous",  type: "building", density: 6 },
  { id: "chamoli_avalanche_scar",    name: "Chamoli Avalanche Scar",       lat: 30.4672, lng:  79.5824, risk: "dangerous",  type: "slope",    density: 5 },
  { id: "bosphorus_fsm_bridge",      name: "Bosphorus Bridge FSM",         lat: 41.0877, lng:  29.0564, risk: "concerning", type: "bridge",   density: 5 },
  { id: "crescent_city_connection",  name: "Crescent City Connection",     lat: 29.9437, lng: -90.0674, risk: "concerning", type: "bridge",   density: 5 },
  { id: "rainier_se_flank",          name: "Mt Rainier SE Flank",          lat: 46.8523, lng:-121.7267, risk: "concerning", type: "slope",    density: 4 },
  { id: "victoria_island_lagos",     name: "Victoria Island Lagos",        lat:  6.4281, lng:   3.4219, risk: "concerning", type: "building", density: 4 },
  { id: "thames_barrier_london",     name: "Thames Barrier London",        lat: 51.4989, lng:   0.0402, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "odaiba_tokyo",              name: "Odaiba Reclaimed Island",      lat: 35.6267, lng: 139.7750, risk: "monitor",    type: "building", density: 3 },

  // ── NORTH AMERICA ──────────────────────────────────────────────────────────
  { id: "ny_brooklyn_bridge",        name: "Brooklyn Bridge New York",     lat: 40.7061, lng: -73.9969, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "ny_fdr_drive",              name: "FDR Drive Manhattan",          lat: 40.7128, lng: -73.9717, risk: "safe",       type: "building", density: 5 },
  { id: "la_i405",                   name: "Los Angeles I-405",            lat: 34.0522, lng:-118.2437, risk: "safe",       type: "building", density: 6 },
  { id: "chicago_lake_shore",        name: "Chicago Lake Shore Drive",     lat: 41.8781, lng: -87.6298, risk: "safe",       type: "bridge",   density: 4 },
  { id: "houston_ship_channel",      name: "Houston Ship Channel",         lat: 29.7604, lng: -95.3698, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "miami_port",                name: "Port of Miami",                lat: 25.7753, lng: -80.1729, risk: "monitor",    type: "building", density: 3 },
  { id: "seattle_tacoma",            name: "Seattle Tacoma Narrows",       lat: 47.6062, lng:-122.3321, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "sf_bay_bridge",             name: "San Francisco Bay Bridge",     lat: 37.7983, lng:-122.3778, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "toronto_gardiner",          name: "Toronto Gardiner Expressway",  lat: 43.6532, lng: -79.3832, risk: "concerning", type: "bridge",   density: 3 },
  { id: "montreal_champlain",        name: "Montréal Champlain Bridge",    lat: 45.4982, lng: -73.5482, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "new_orleans_9th_ward",      name: "New Orleans 9th Ward",         lat: 29.9793, lng: -89.9928, risk: "dangerous",  type: "building", density: 5 },
  { id: "miami_south_beach",         name: "Miami South Beach Subsidence", lat: 25.7825, lng: -80.1300, risk: "concerning", type: "building", density: 4 },
  { id: "sf_mission_dist",           name: "San Francisco Mission Dist.",  lat: 37.7599, lng:-122.4148, risk: "monitor",    type: "building", density: 3 },
  { id: "vancouver_north_shore",     name: "Vancouver North Shore Slope",  lat: 49.3163, lng:-123.0729, risk: "monitor",    type: "slope",    density: 3 },
  { id: "port_los_angeles",          name: "Port of Los Angeles",          lat: 33.7370, lng:-118.2690, risk: "safe",       type: "building", density: 4 },

  // ── SOUTH AMERICA ──────────────────────────────────────────────────────────
  { id: "lima_coastal",              name: "Lima Coastal Subsidence",      lat:-12.0464, lng: -77.0428, risk: "dangerous",  type: "building", density: 5 },
  { id: "bogota_cerros",             name: "Bogotá Cerros Slope",          lat:  4.7110, lng: -74.0721, risk: "concerning", type: "slope",    density: 4 },
  { id: "sao_paulo_ring",            name: "São Paulo Marginal Ring",      lat:-23.5505, lng: -46.6333, risk: "concerning", type: "building", density: 5 },
  { id: "rio_niteroi_bridge",        name: "Rio–Niterói Bridge",           lat:-22.8870, lng: -43.1681, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "buenos_aires_coastal",      name: "Buenos Aires Coastal Zone",    lat:-34.6037, lng: -58.3816, risk: "monitor",    type: "building", density: 3 },
  { id: "santiago_ring",             name: "Santiago Urban Ring",          lat:-33.4489, lng: -70.6693, risk: "monitor",    type: "building", density: 3 },
  { id: "caracas_valley",            name: "Caracas Valley Slope",         lat: 10.4806, lng: -66.9036, risk: "concerning", type: "slope",    density: 3 },
  { id: "medellin_slopes",           name: "Medellín Hillside Settlements",lat:  6.2442, lng: -75.5812, risk: "concerning", type: "slope",    density: 3 },

  // ── EUROPE ─────────────────────────────────────────────────────────────────
  { id: "london_m25",                name: "London M25 Orbital",           lat: 51.5074, lng:  -0.1278, risk: "safe",       type: "building", density: 5 },
  { id: "paris_peripherique",        name: "Paris Périphérique",           lat: 48.8566, lng:   2.3522, risk: "safe",       type: "building", density: 5 },
  { id: "amsterdam_canal",           name: "Amsterdam Canal Zone",         lat: 52.3676, lng:   4.9041, risk: "concerning", type: "building", density: 4 },
  { id: "rotterdam_port",            name: "Port of Rotterdam",            lat: 51.9225, lng:   4.4792, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "hamburg_port",              name: "Port of Hamburg",              lat: 53.5753, lng:   9.9667, risk: "monitor",    type: "building", density: 3 },
  { id: "venice_lagoon",             name: "Venice Lagoon Settlement",     lat: 45.4408, lng:  12.3155, risk: "dangerous",  type: "building", density: 6 },
  { id: "berlin_ring",               name: "Berlin Stadtring",             lat: 52.5200, lng:  13.4050, risk: "safe",       type: "building", density: 4 },
  { id: "warsaw_vistula",            name: "Warsaw Vistula Bridges",       lat: 52.2297, lng:  21.0122, risk: "concerning", type: "bridge",   density: 3 },
  { id: "oslo_fjord_slope",          name: "Oslo Fjord Slope Zone",        lat: 59.9139, lng:  10.7522, risk: "concerning", type: "slope",    density: 3 },
  { id: "madrid_metro",              name: "Madrid Metro Subsidence",      lat: 40.4168, lng:  -3.7038, risk: "monitor",    type: "building", density: 3 },
  { id: "lisbon_tagus_bridge",       name: "Lisbon Tagus Bridge",          lat: 38.6784, lng:  -9.1773, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "milan_ring",                name: "Milan Tangenziale",            lat: 45.4654, lng:   9.1859, risk: "safe",       type: "building", density: 4 },
  { id: "rome_tiber",                name: "Rome Tiber Bridge Zone",       lat: 41.9028, lng:  12.4964, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "athens_coastal",            name: "Athens Coastal Motorway",      lat: 37.9838, lng:  23.7275, risk: "safe",       type: "building", density: 3 },
  { id: "bucharest_beltway",         name: "Bucharest Beltway",            lat: 44.4268, lng:  26.1025, risk: "monitor",    type: "building", density: 3 },

  // ── MIDDLE EAST & AFRICA ──────────────────────────────────────────────────
  { id: "cairo_ring_road",           name: "Cairo Ring Road",              lat: 30.0444, lng:  31.2357, risk: "concerning", type: "building", density: 4 },
  { id: "dubai_sheikh_zayed",        name: "Dubai Sheikh Zayed Road",      lat: 25.2048, lng:  55.2708, risk: "safe",       type: "bridge",   density: 5 },
  { id: "riyadh_ring",               name: "Riyadh Ring Road",             lat: 24.7136, lng:  46.6753, risk: "safe",       type: "building", density: 4 },
  { id: "tel_aviv_coastal",          name: "Tel Aviv Coastal Highway",     lat: 32.0853, lng:  34.7818, risk: "monitor",    type: "building", density: 3 },
  { id: "lagos_ibadan_express",      name: "Lagos–Ibadan Expressway",      lat:  6.5244, lng:   3.3792, risk: "concerning", type: "building", density: 4 },
  { id: "nairobi_cbd",               name: "Nairobi CBD Zone",             lat: -1.2921, lng:  36.8219, risk: "concerning", type: "building", density: 4 },
  { id: "johannesburg_ring",         name: "Johannesburg N1 Ring",         lat:-26.2041, lng:  28.0473, risk: "monitor",    type: "building", density: 4 },
  { id: "addis_ring",                name: "Addis Ababa Ring Road",        lat:  9.0250, lng:  38.7469, risk: "monitor",    type: "building", density: 3 },
  { id: "casablanca_coast",          name: "Casablanca Coastal Zone",      lat: 33.5731, lng:  -7.5898, risk: "stable",     type: "building", density: 3 },
  { id: "accra_harbour",             name: "Accra Harbour District",       lat:  5.5600, lng:  -0.2057, risk: "monitor",    type: "building", density: 3 },

  // ── ASIA ──────────────────────────────────────────────────────────────────
  { id: "beijing_4th_ring",          name: "Beijing 4th Ring Road",        lat: 39.9042, lng: 116.4074, risk: "safe",       type: "building", density: 6 },
  { id: "seoul_han_river",           name: "Seoul Han River Bridges",      lat: 37.5326, lng: 126.9707, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "tokyo_bayshore",            name: "Tokyo Bayshore Route",         lat: 35.6586, lng: 139.7584, risk: "safe",       type: "bridge",   density: 5 },
  { id: "mumbai_expressway",         name: "Mumbai–Pune Expressway",       lat: 19.0760, lng:  72.8777, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "delhi_metro_ring",          name: "Delhi Metro Ring Zone",        lat: 28.6139, lng:  77.2090, risk: "monitor",    type: "building", density: 4 },
  { id: "bangalore_outer_ring",      name: "Bangalore Outer Ring Road",    lat: 12.9716, lng:  77.5946, risk: "safe",       type: "building", density: 4 },
  { id: "singapore_marina",          name: "Singapore Marina Bay",         lat:  1.2816, lng: 103.8636, risk: "stable",     type: "building", density: 4 },
  { id: "bangkok_expressway",        name: "Bangkok Expressway Network",   lat: 13.7563, lng: 100.5018, risk: "safe",       type: "building", density: 5 },
  { id: "kuala_lumpur",              name: "Kuala Lumpur DUKE Hwy",        lat:  3.1390, lng: 101.6869, risk: "safe",       type: "building", density: 4 },
  { id: "manila_edsa",               name: "Manila EDSA Corridor",         lat: 14.5995, lng: 120.9842, risk: "monitor",    type: "building", density: 5 },
  { id: "hong_kong_east",            name: "Hong Kong Eastern Corridor",   lat: 22.3193, lng: 114.1694, risk: "monitor",    type: "bridge",   density: 4 },
  { id: "shenzhen_coastal",          name: "Shenzhen Bay Bridge",          lat: 22.5431, lng: 114.0579, risk: "safe",       type: "bridge",   density: 4 },
  { id: "taipei_freeway",            name: "Taipei Freeway No.1",          lat: 25.0330, lng: 121.5654, risk: "safe",       type: "building", density: 4 },
  { id: "osaka_highway",             name: "Osaka Hanshin Expressway",     lat: 34.6937, lng: 135.5023, risk: "safe",       type: "bridge",   density: 4 },
  { id: "karachi_port",              name: "Karachi Port Highway",         lat: 24.8399, lng:  67.0014, risk: "concerning", type: "bridge",   density: 3 },
  { id: "dhaka_ring_road",           name: "Dhaka Inner Ring Road",        lat: 23.8103, lng:  90.3563, risk: "dangerous",  type: "building", density: 6 },
  { id: "tehran_motorway",           name: "Tehran Chamran Motorway",      lat: 35.6892, lng:  51.3890, risk: "safe",       type: "building", density: 4 },
  { id: "istanbul_ring",             name: "Istanbul TEM Motorway",        lat: 41.0082, lng:  28.9784, risk: "safe",       type: "building", density: 5 },
  { id: "hcmc_highway",              name: "Ho Chi Minh City Highway",     lat: 10.8231, lng: 106.6297, risk: "concerning", type: "building", density: 4 },
  { id: "yangon_downtown",           name: "Yangon Downtown Zone",         lat: 16.8409, lng:  96.1561, risk: "monitor",    type: "building", density: 3 },

  // ── RUSSIA & CENTRAL ASIA ─────────────────────────────────────────────────
  { id: "moscow_ring",               name: "Moscow MKAD Ring Road",        lat: 55.7558, lng:  37.6173, risk: "safe",       type: "building", density: 5 },
  { id: "st_pete_bridge",            name: "St. Petersburg Palace Bridge", lat: 59.9386, lng:  30.3141, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "almaty_foothills",          name: "Almaty Trans-Ili Slope",       lat: 43.2220, lng:  76.8512, risk: "concerning", type: "slope",    density: 3 },

  // ── OCEANIA ───────────────────────────────────────────────────────────────
  { id: "sydney_harbour_bridge",     name: "Sydney Harbour Bridge",        lat:-33.8523, lng: 151.2108, risk: "monitor",    type: "bridge",   density: 3 },
  { id: "melbourne_westgate",        name: "Melbourne West Gate Bridge",   lat:-37.8333, lng: 144.9060, risk: "concerning", type: "bridge",   density: 3 },
  { id: "brisbane_gateway",          name: "Brisbane Gateway Bridge",      lat:-27.4698, lng: 153.1063, risk: "stable",     type: "bridge",   density: 3 },
  { id: "perth_freeway",             name: "Perth Kwinana Freeway",        lat:-31.9505, lng: 115.8605, risk: "safe",       type: "building", density: 3 },
  { id: "auckland_harbour",          name: "Auckland Harbour Bridge",      lat:-36.8254, lng: 174.7627, risk: "stable",     type: "bridge",   density: 3 },
  { id: "nz_alpine_fault",           name: "NZ Alpine Fault Zone",         lat:-43.5321, lng: 172.6362, risk: "dangerous",  type: "slope",    density: 4 },

  // ── MILITARY MONITORING ZONES ─────────────────────────────────────────────
  { id: "taiwan_strait",        name: "Taiwan Strait Chokepoint",     lat: 24.5,  lng: 120.5,  risk: "dangerous",  type: "military", density: 8 },
  { id: "strait_hormuz",        name: "Strait of Hormuz",             lat: 26.5,  lng:  56.5,  risk: "dangerous",  type: "military", density: 7 },
  { id: "south_china_sea_scs",  name: "South China Sea — Spratlys",   lat: 10.5,  lng: 114.0,  risk: "dangerous",  type: "military", density: 7 },
  { id: "black_sea_kerch",      name: "Black Sea — Kerch Strait",     lat: 45.3,  lng:  36.5,  risk: "dangerous",  type: "military", density: 6 },
  { id: "bab_el_mandeb",        name: "Bab-el-Mandeb Strait",         lat: 12.6,  lng:  43.4,  risk: "dangerous",  type: "military", density: 6 },
  { id: "malacca_strait",       name: "Malacca Strait",               lat:  3.1,  lng: 101.7,  risk: "concerning", type: "military", density: 5 },
  { id: "suez_canal",           name: "Suez Canal Transit Zone",      lat: 30.7,  lng:  32.3,  risk: "concerning", type: "military", density: 5 },
  { id: "ukraine_frontline",    name: "Ukraine Eastern Front",        lat: 48.9,  lng:  37.8,  risk: "dangerous",  type: "military", density: 8 },
  { id: "kashmir_loc",          name: "Kashmir Line of Control",      lat: 34.1,  lng:  74.8,  risk: "dangerous",  type: "military", density: 6 },
  { id: "korean_dmz",           name: "Korean DMZ",                   lat: 38.0,  lng: 127.5,  risk: "dangerous",  type: "military", density: 6 },
  { id: "gaza_border",          name: "Gaza–Israel Border Zone",      lat: 31.4,  lng:  34.4,  risk: "dangerous",  type: "military", density: 7 },
  { id: "south_sudan_border",   name: "South Sudan–Sudan Border",     lat:  9.8,  lng:  31.5,  risk: "concerning", type: "military", density: 4 },
  { id: "myanmar_china_border", name: "Myanmar Northern Conflict",    lat: 23.5,  lng:  98.0,  risk: "concerning", type: "military", density: 5 },
  { id: "crimea_coast",         name: "Crimea Naval Corridor",        lat: 45.2,  lng:  34.1,  risk: "dangerous",  type: "military", density: 7 },
  { id: "guam_naval_base",      name: "Guam Naval Base Perimeter",    lat: 13.4,  lng: 144.7,  risk: "monitor",    type: "military", density: 4 },
] as const;

type Zone = (typeof MONITORING_ZONES)[number];

// ── Module-level state for dark-zone detection ────────────────────────────────
const previousDensities = new Map<string, number>();

// ── Seeded pseudo-random ──────────────────────────────────────────────────────
function sr(seed: number, salt: number = 0): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Event generation ──────────────────────────────────────────────────────────
function generateEvents(tw: number): MovementEvent[] {
  const out: MovementEvent[] = [];
  let idx = 0;

  for (const zone of MONITORING_ZONES) {
    for (let i = 0; i < zone.density; i++) {
      const seed = tw * 10000 + idx;

      // Position jitter around zone centre
      // Military zones: tighter formation spacing (0.3–1 km ≈ 0.003–0.009 deg)
      const jitterScale = zone.type === "military" ? 0.009 : 0.016;
      const latOff = (sr(seed, 1) - 0.5) * jitterScale;
      const lngOff = (sr(seed, 2) - 0.5) * jitterScale;
      const lat = zone.lat + latOff;
      const lng = zone.lng + lngOff;

      const degDist = Math.sqrt(latOff ** 2 + lngOff ** 2);
      const riskProximity: RiskProximity =
        degDist < 0.003 ? "danger" : degDist < 0.008 ? "caution" : "safe";

      // Directional logic
      const toCentre = Math.atan2(zone.lat - lat, zone.lng - lng) * 180 / Math.PI;
      const roll = sr(seed, 5);
      let heading: number;

      if (zone.type === "military") {
        // Convoys cluster heading with ±20° variance
        const baseHeading = sr(zone.id.length * 17 + 3, 0) * 360;
        heading = ((baseHeading + (sr(seed, 6) - 0.5) * 40) % 360 + 360) % 360;
      } else if (zone.risk === "dangerous" && roll < 0.52) {
        heading = ((toCentre + 180 + (sr(seed, 6) - 0.5) * 50) % 360 + 360) % 360;
      } else if (zone.risk === "dangerous" && roll < 0.78) {
        heading = ((toCentre + (sr(seed, 6) - 0.5) * 25) % 360 + 360) % 360;
      } else {
        heading = sr(seed, 7) * 360;
      }

      // Type assignment
      let type: MovementType;
      if (zone.type === "military") {
        type = "vehicle"; // military entities are always vehicles
      } else {
        const typeRoll = sr(seed, 8);
        if (zone.type === "bridge") {
          type = typeRoll < 0.75 ? "vehicle" : "person";
        } else if (zone.type === "slope") {
          type = typeRoll < 0.18 ? "vehicle" : typeRoll < 0.75 ? "person" : "group";
        } else {
          type = typeRoll < 0.52 ? "vehicle" : typeRoll < 0.88 ? "person" : "group";
        }
      }

      // Speed: military 40–80 km/h, vehicle 20–110 km/h, person 2–12 km/h
      const speed = zone.type === "military"
        ? Math.round(40 + sr(seed, 9) * 40)
        : type === "vehicle"
          ? Math.round(20 + sr(seed, 9) * 90)
          : Math.round(2 + sr(seed, 9) * 10);

      out.push({
        id: `ev_${zone.id}_${tw}_${i}`,
        type,
        lat: Math.round(lat * 1e5) / 1e5,
        lng: Math.round(lng * 1e5) / 1e5,
        heading: Math.round(heading),
        speed,
        nearAssetId: zone.id,
        nearAssetName: zone.name,
        riskProximity,
        timestamp: new Date().toISOString(),
        count: type === "group" ? Math.floor(2 + sr(seed, 10) * 9) : undefined,
      });
      idx++;
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════
// PATTERN DETECTION
// ═════════════════════════════════════════════════════════════

function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371, dLat = (la2 - la1) * Math.PI / 180, dLng = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// 1. DBSCAN
function dbscan(events: MovementEvent[]): MovementCluster[] {
  const EPS = 0.6, MINPTS = 3;
  const visited = new Set<string>(), inCluster = new Set<string>(), out: MovementCluster[] = [];

  for (const evt of events) {
    if (visited.has(evt.id)) continue;
    visited.add(evt.id);
    const neighbors = events.filter(e => e.id !== evt.id && haversineKm(evt.lat, evt.lng, e.lat, e.lng) <= EPS);
    if (neighbors.length + 1 < MINPTS) continue;
    const cluster: MovementEvent[] = [evt];
    const queue = [...neighbors];
    while (queue.length) {
      const cur = queue.shift()!;
      if (!visited.has(cur.id)) {
        visited.add(cur.id);
        const nn = events.filter(e => !cluster.some(c => c.id === e.id) && haversineKm(cur.lat, cur.lng, e.lat, e.lng) <= EPS);
        if (nn.length + 1 >= MINPTS) queue.push(...nn);
      }
      if (!inCluster.has(cur.id)) { cluster.push(cur); inCluster.add(cur.id); }
    }
    inCluster.add(evt.id);
    const cLat = cluster.reduce((s, e) => s + e.lat, 0) / cluster.length;
    const cLng = cluster.reduce((s, e) => s + e.lng, 0) / cluster.length;
    const risk: RiskProximity = cluster.some(e => e.riskProximity === "danger") ? "danger" : cluster.some(e => e.riskProximity === "caution") ? "caution" : "safe";
    const ac: Record<string, number> = {};
    cluster.forEach(e => { ac[e.nearAssetId] = (ac[e.nearAssetId] ?? 0) + 1; });
    const nearAssetId = Object.entries(ac).sort((a, b) => b[1] - a[1])[0][0];
    out.push({ id: `cl_${out.length}`, centerLat: Math.round(cLat * 1e5) / 1e5, centerLng: Math.round(cLng * 1e5) / 1e5, count: cluster.length, nearAssetId, risk });
  }
  return out;
}

// 2. Directional convergence/evacuation
function directional(events: MovementEvent[], zones: readonly Zone[]): MovementPattern[] {
  const out: MovementPattern[] = [];
  for (const z of zones) {
    if (z.risk !== "dangerous" && z.risk !== "concerning") continue;
    const evts = events.filter(e => e.nearAssetId === z.id);
    if (evts.length < 3) continue;
    const analysis = evts.map(e => {
      const toZ = Math.atan2(z.lat - e.lat, z.lng - e.lng) * 180 / Math.PI;
      let diff = Math.abs(((toZ % 360 + 360) % 360) - ((e.heading % 360 + 360) % 360));
      if (diff > 180) diff = 360 - diff;
      return { conv: diff < 45, div: diff > 135 };
    });
    const nConv = analysis.filter(d => d.conv).length;
    const nDiv  = analysis.filter(d => d.div).length;
    const total = evts.length;
    if (nConv / total > 0.50) {
      out.push({ type: "convergence" as PatternType, assetId: z.id, assetName: z.name, description: `${nConv}/${total} entities converging on ${z.risk.toUpperCase()} zone`, severity: z.risk === "dangerous" ? "critical" as PatternSeverity : "warning" as PatternSeverity, eventCount: nConv, confidence: Math.round(nConv / total * 100) / 100 });
    } else if (nDiv / total > 0.60) {
      out.push({ type: "evacuation" as PatternType, assetId: z.id, assetName: z.name, description: `${nDiv}/${total} entities dispersing from ${z.risk.toUpperCase()} zone`, severity: "warning" as PatternSeverity, eventCount: nDiv, confidence: Math.round(nDiv / total * 100) / 100 });
    }
  }
  return out;
}

// 3. Density anomaly
function density(events: MovementEvent[], zones: readonly Zone[]): MovementPattern[] {
  const out: MovementPattern[] = [];
  for (const z of zones) {
    const inDanger = events.filter(e => e.nearAssetId === z.id && e.riskProximity === "danger").length;
    const baseline = z.risk === "dangerous" ? 1.5 : z.risk === "concerning" ? 2.5 : z.risk === "monitor" ? 3.5 : 5;
    if (inDanger >= baseline * 2.2) {
      out.push({ type: "density_anomaly" as PatternType, assetId: z.id, assetName: z.name, description: `${inDanger} entities in danger zone (${Math.round(inDanger/baseline*10)/10}× baseline)`, severity: z.risk === "dangerous" ? "critical" as PatternSeverity : "warning" as PatternSeverity, eventCount: inDanger, confidence: Math.min(0.95, Math.round(((inDanger - baseline) / (baseline * 3)) * 100) / 100) });
    }
  }
  return out;
}

// 4. Cluster-derived patterns
function clusterPatterns(clusters: MovementCluster[], zones: readonly Zone[]): MovementPattern[] {
  return clusters.filter(c => c.count >= 4).map(c => {
    const z = zones.find(a => a.id === c.nearAssetId);
    return { type: "cluster" as PatternType, assetId: c.nearAssetId, assetName: z?.name ?? c.nearAssetId, description: `DBSCAN: ${c.count} entities within 600m at ${c.risk} proximity`, severity: (c.risk === "danger" ? "critical" : c.risk === "caution" ? "warning" : "info") as PatternSeverity, eventCount: c.count, confidence: Math.min(0.9, c.count / 8) };
  });
}

// 5. Cross-zone: multiple dangerous zones active simultaneously
function crossZone(events: MovementEvent[], zones: readonly Zone[]): MovementPattern[] {
  const activeD = zones.filter(z => z.risk === "dangerous" && events.some(e => e.nearAssetId === z.id && e.riskProximity !== "safe"));
  if (activeD.length >= 4) {
    return [{ type: "density_anomaly" as PatternType, assetId: "multi_zone", assetName: "Multi-Zone Alert", description: `Simultaneous activity near ${activeD.length} DANGEROUS zones globally`, severity: "critical" as PatternSeverity, eventCount: activeD.length, confidence: 0.82 }];
  }
  return [];
}

// 6. Convoy and military pattern detection
function convoysAndMilitary(events: MovementEvent[], zones: readonly Zone[]): MovementPattern[] {
  const out: MovementPattern[] = [];
  const milZones = zones.filter(z => z.type === "military");

  for (const z of milZones) {
    const zoneEvents = events.filter(e =>
      e.nearAssetId === z.id &&
      e.type === "vehicle" &&
      e.speed > 25
    );
    if (zoneEvents.length < 3) continue;

    // Find clusters of 3+ events within 1.5km radius
    const used = new Set<string>();
    for (const pivot of zoneEvents) {
      if (used.has(pivot.id)) continue;
      const nearby = zoneEvents.filter(e =>
        !used.has(e.id) &&
        haversineKm(pivot.lat, pivot.lng, e.lat, e.lng) <= 1.5
      );
      if (nearby.length < 3) continue;

      // Check heading alignment (within 35° of mean)
      const headings = nearby.map(e => e.heading);
      const sinSum = headings.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0);
      const cosSum = headings.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0);
      const meanHeading = Math.atan2(sinSum / headings.length, cosSum / headings.length) * 180 / Math.PI;
      const aligned = nearby.filter(e => {
        let diff = Math.abs(e.heading - ((meanHeading + 360) % 360));
        if (diff > 180) diff = 360 - diff;
        return diff <= 35;
      });

      if (aligned.length >= 3) {
        const avgSpeed = Math.round(aligned.reduce((s, e) => s + e.speed, 0) / aligned.length);
        aligned.forEach(e => used.add(e.id));
        out.push({
          type: "convoy" as PatternType,
          assetId: z.id,
          assetName: z.name,
          description: `CONVOY DETECTED: ${aligned.length} vehicles in formation — ${avgSpeed} km/h avg — ${z.name}`,
          severity: (z.risk === "dangerous" ? "critical" : "warning") as PatternSeverity,
          eventCount: aligned.length,
          confidence: Math.min(0.95, 0.70 + aligned.length * 0.05),
        });
      }
    }
  }
  return out;
}

// 7. Dark zone detection — AIS-silent zones
function darkZone(events: MovementEvent[], zones: readonly Zone[]): MovementPattern[] {
  const out: MovementPattern[] = [];
  const milZones = zones.filter(z => z.type === "military");

  for (const z of milZones) {
    const currentCount = events.filter(e => e.nearAssetId === z.id).length;
    const prevCount = previousDensities.get(z.id);

    if (prevCount !== undefined && prevCount > 0 && currentCount === 0) {
      out.push({
        type: "dark_zone" as PatternType,
        assetId: z.id,
        assetName: z.name,
        description: `DARK ZONE: ${z.name} went AIS-silent (was ${prevCount} entities)`,
        severity: (z.risk === "dangerous" ? "critical" : "warning") as PatternSeverity,
        eventCount: 0,
        confidence: 0.78,
      });
    }

    previousDensities.set(z.id, currentCount);
  }
  return out;
}

// ── GET /api/movement ─────────────────────────────────────────────────────────
export async function GET() {
  const t0 = Date.now();
  try {
    const tw = Math.floor(Date.now() / 5000);
    const events = generateEvents(tw);
    const clusters = dbscan(events);

    const sRank: Record<PatternSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const patterns: MovementPattern[] = [
      ...directional(events, MONITORING_ZONES),
      ...density(events, MONITORING_ZONES),
      ...clusterPatterns(clusters, MONITORING_ZONES),
      ...crossZone(events, MONITORING_ZONES),
      ...convoysAndMilitary(events, MONITORING_ZONES),
      ...darkZone(events, MONITORING_ZONES),
    ]
      .filter((p, i, arr) => arr.findIndex(q => q.assetId === p.assetId && q.type === p.type) === i)
      .sort((a, b) => sRank[a.severity] - sRank[b.severity]);

    const dangerZoneEvents = events.filter(e => e.riskProximity === "danger").length;
    const analysisMs = Date.now() - t0;

    console.info(`[movement] zones=${MONITORING_ZONES.length} events=${events.length} clusters=${clusters.length} patterns=${patterns.length} danger=${dangerZoneEvents} ms=${analysisMs}`);

    const response: MovementResponse = {
      events, clusters, patterns,
      summary: { totalEvents: events.length, dangerZoneEvents, patternCount: patterns.length, timestamp: new Date().toISOString(), analysisMs },
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[movement] failed: ${msg}`);
    return NextResponse.json({ error: "Movement analysis failed", detail: msg }, { status: 500 });
  }
}
