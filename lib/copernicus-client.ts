// lib/copernicus-client.ts
// Copernicus Data Space Ecosystem (CDSE) API client
// Catalog search requires NO authentication — free and public.
// Scene DOWNLOAD requires a free Copernicus account (env vars below).
//
// APIs used:
//   STAC:  https://catalogue.dataspace.copernicus.eu/stac/v1
//   OData: https://catalogue.dataspace.copernicus.eu/odata/v1
//   Auth:  https://identity.dataspace.copernicus.eu/...

// Verified 2026-04: STAC at stac.dataspace.copernicus.eu/v1 (not catalogue subdomain)
const STAC_BASE  = "https://stac.dataspace.copernicus.eu/v1";
const ODATA_BASE = "https://catalogue.dataspace.copernicus.eu/odata/v1";
const TOKEN_URL  = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

export interface S1Scene {
  id: string;
  title: string;
  datetime: string;              // ISO-8601
  acquisitionMode: string;       // IW, EW, SM
  polarisation: string;          // VV+VH, HH+HV, etc.
  orbitDirection: string;        // ASCENDING / DESCENDING
  relativeOrbit: number;
  geometry: GeoJSON.Geometry;
  quicklookUrl: string | null;
  downloadUrl: string | null;
  productType: string;           // GRD, SLC, OCN
  platformSerialIdentifier: string; // S1A / S1B
  cloudCover: number;
  footprintArea_km2: number;
}

export interface SceneSearchParams {
  lat: number;
  lng: number;
  radiusDeg?: number;            // bounding box half-width in degrees (default 0.5)
  daysBack?: number;             // default 60
  productType?: "GRD" | "SLC";  // default GRD
  limit?: number;                // default 8
}

// ── STAC search for S1 scenes near a point ────────────────────────────────────
export async function searchS1Scenes(params: SceneSearchParams): Promise<S1Scene[]> {
  const r = params.radiusDeg ?? 0.5;
  const days = params.daysBack ?? 60;
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400 * 1000);

  const bbox = [
    params.lng - r,
    params.lat - r,
    params.lng + r,
    params.lat + r,
  ];

  // Verified collection name: "sentinel-1-grd" or "sentinel-1-slc"
  // Filter uses CQL2-JSON format with op/args structure
  const collectionName = params.productType === "SLC" ? "sentinel-1-slc" : "sentinel-1-grd";

  const filterArgs: unknown[] = [
    {
      op: ">=",
      args: [{ property: "datetime" }, { timestamp: `${from.toISOString().split(".")[0]}Z` }],
    },
    {
      op: "s_intersects",
      args: [
        { property: "geometry" },
        { type: "Polygon", coordinates: [[
          [bbox[0], bbox[1]], [bbox[2], bbox[1]],
          [bbox[2], bbox[3]], [bbox[0], bbox[3]],
          [bbox[0], bbox[1]],
        ]]},
      ],
    },
  ];

  const body = {
    collections: [collectionName],
    limit: params.limit ?? 8,
    sortby: [{ field: "datetime", direction: "desc" }],
    filter: { op: "and", args: filterArgs },
    "filter-lang": "cql2-json",
  };

  try {
    const res = await fetch(`${STAC_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[copernicus] STAC search failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.features ?? []).map(parseStacItem);
  } catch (err) {
    console.warn("[copernicus] STAC search error:", (err as Error).message);
    return [];
  }
}

// ── OData search alternative (more filter options) ────────────────────────────
export async function searchS1OData(params: SceneSearchParams): Promise<S1Scene[]> {
  const r = params.radiusDeg ?? 0.5;
  const days = params.daysBack ?? 60;
  const from = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const type = params.productType ?? "GRD";

  // Build WKT point geometry for Intersects filter
  const wkt = `POINT(${params.lng} ${params.lat})`;

  const filter = [
    `Collection/Name eq 'SENTINEL-1'`,
    `OData.CSC.Intersects(area=geography'SRID=4326;${wkt}')`,
    `ContentDate/Start gt ${from}`,
    `Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/Value eq '${type}')`,
  ].join(" and ");

  const url = `${ODATA_BASE}/Products?$filter=${encodeURIComponent(filter)}&$top=${params.limit ?? 8}&$orderby=ContentDate/Start desc&$expand=Attributes`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn(`[copernicus] OData search failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.value ?? []).map(parseODataItem);
  } catch (err) {
    console.warn("[copernicus] OData search error:", (err as Error).message);
    return [];
  }
}

// ── OAuth token for CDSE (needed for downloads, not catalog) ─────────────────
export async function getCDSEToken(): Promise<string | null> {
  const user = process.env.COPERNICUS_USERNAME;
  const pass = process.env.COPERNICUS_PASSWORD;
  if (!user || !pass) return null;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "cdse-public",
    username: user,
    password: pass,
  });
  try {
    const res = await fetch(TOKEN_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Get quicklook image base64 ────────────────────────────────────────────────
export async function fetchQuicklook(sceneId: string, token?: string): Promise<string | null> {
  const url = `${ODATA_BASE}/Products(${sceneId})/Assets?$filter=Type eq 'QUICKLOOK'`;
  try {
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const assetUrl: string | undefined = data.value?.[0]?.DownloadLink;
    if (!assetUrl) return null;

    const imgRes = await fetch(assetUrl, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseStacItem(item: Record<string, unknown>): S1Scene {
  const props = (item.properties ?? {}) as Record<string, unknown>;
  const links = (item.links ?? []) as Array<Record<string, string>>;
  const thumb = links.find((l) => l.rel === "thumbnail" || l.rel === "preview");

  return {
    id: String(item.id ?? ""),
    title: String(props.title ?? item.id ?? ""),
    datetime: String(props.datetime ?? ""),
    acquisitionMode: String(props["s1:instrumentMode"] ?? props["sar:instrument_mode"] ?? "IW"),
    polarisation: String(props["sar:polarizations"] ?? "VV VH"),
    orbitDirection: String(props["sat:orbit_state"] ?? "ASCENDING").toUpperCase(),
    relativeOrbit: Number(props["sat:relative_orbit"] ?? 0),
    geometry: (item.geometry ?? {}) as GeoJSON.Geometry,
    quicklookUrl: thumb?.href ?? null,
    downloadUrl: null,
    productType: String(props["s1:productType"] ?? "GRD"),
    platformSerialIdentifier: String(props["platform"] ?? "SENTINEL-1A"),
    cloudCover: 0, // SAR is cloud-independent
    footprintArea_km2: estimateFootprintArea(item.geometry as GeoJSON.Geometry),
  };
}

function parseODataItem(item: Record<string, unknown>): S1Scene {
  const attrs = ((item.Attributes ?? []) as Array<{ Name: string; Value: unknown }>)
    .reduce<Record<string, unknown>>((acc, a) => { acc[a.Name] = a.Value; return acc; }, {});

  return {
    id: String(item.Id ?? ""),
    title: String(item.Name ?? ""),
    datetime: String((item.ContentDate as Record<string, string>)?.Start ?? ""),
    acquisitionMode: String(attrs["operationalMode"] ?? "IW"),
    polarisation: String(attrs["polarisationChannels"] ?? "VV VH"),
    orbitDirection: String(attrs["orbitDirection"] ?? "ASCENDING").toUpperCase(),
    relativeOrbit: Number(attrs["relativeOrbit"] ?? 0),
    geometry: parseFootprint(String(item.Footprint ?? "")),
    quicklookUrl: null,
    downloadUrl: null,
    productType: String(attrs["productType"] ?? "GRD"),
    platformSerialIdentifier: String(attrs["platformSerialIdentifier"] ?? "S1A"),
    cloudCover: 0,
    footprintArea_km2: 0,
  };
}

function parseFootprint(wkt: string): GeoJSON.Geometry {
  try {
    // Very basic WKT POLYGON → GeoJSON conversion
    const match = wkt.match(/POLYGON\s*\(\((.+?)\)\)/i);
    if (!match) return { type: "Point", coordinates: [0, 0] };
    const coords = match[1].split(",").map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    return { type: "Polygon", coordinates: [coords] };
  } catch {
    return { type: "Point", coordinates: [0, 0] };
  }
}

function estimateFootprintArea(geom: GeoJSON.Geometry): number {
  if (!geom || geom.type !== "Polygon") return 0;
  const coords = (geom as GeoJSON.Polygon).coordinates[0];
  if (!coords?.length) return 0;
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  return Math.round(latSpan * 111 * lngSpan * 111 * Math.cos(avgLat * Math.PI / 180));
}
