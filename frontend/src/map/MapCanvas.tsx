import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { Map, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, type MutableRefObject } from "react";

import { DataSourceModeBadge } from "../components/shared/DataSourceModeBadge";
import { operationalCase, operationalForecast, operationalSlick, operationalSource } from "../data/operational";
import { INDIA_EEZ_BOUNDS } from "./layers/base";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";

export type OperationPhase = "monitoring" | "eez" | "detection" | "hindcast" | "forecast" | "ais" | "ranking";

// ---------------------------------------------------------------------------
// Static geometry (kept local so the map never depends on a network call for
// the investigation data itself - only the optional basemap tiles were ever
// remote, and those have been removed below).
// ---------------------------------------------------------------------------

const sceneFootprint: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[72.58, 18.42], [73.58, 18.42], [73.58, 19.38], [72.58, 19.38], [72.58, 18.42]]]
};

const indiaEezOutline: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[66.5, 5.5], [94.5, 5.5], [94.5, 24.5], [66.5, 24.5], [66.5, 5.5]]]
};

const indiaLandContext: GeoJSON.MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [[
      [68.1, 23.8], [69.1, 22.7], [70.1, 21.3], [70.4, 20.1], [71.0, 18.8],
      [72.0, 17.0], [72.7, 15.7], [73.3, 14.5], [74.2, 13.2], [74.8, 12.1],
      [75.6, 10.7], [76.8, 8.5], [77.8, 8.1], [78.9, 9.3], [79.8, 11.6],
      [80.5, 13.4], [80.2, 15.7], [81.1, 17.6], [82.4, 18.8], [84.0, 19.7],
      [85.8, 20.7], [87.3, 21.6], [88.8, 22.1], [89.2, 23.3], [88.0, 24.2],
      [85.8, 24.7], [82.8, 24.4], [79.5, 24.9], [76.8, 24.5], [74.0, 24.1],
      [71.2, 24.6], [68.1, 23.8]
    ]],
    [[[79.7, 9.7], [80.4, 8.9], [81.1, 7.7], [81.7, 6.9], [81.3, 6.0], [80.3, 5.9], [79.7, 6.8], [79.4, 8.3], [79.7, 9.7]]]
  ]
};

const hindcastCoords: [number, number][] = [[73.05, 18.92], [72.99, 18.87], [72.91, 18.82], [72.79, 18.76]];

// The three forward-drift contours in the sample data all share one polygon.
// We derive visually distinct 50 / 80 / 95 percentile rings by scaling that
// polygon around the slick centroid, so the forecast genuinely reads as a
// spreading envelope instead of three identical overlapping shapes.
const forecastScaleByPercentile: Record<50 | 80 | 95, number> = { 50: 0.5, 80: 0.82, 95: 1.18 };

const vesselFeatures: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [
    featurePoint([72.82, 18.79], { rank: 1, score: 78, name: "MV Samudra Prerna", mmsi: "419000111" }),
    featurePoint([72.96, 18.71], { rank: 2, score: 61, name: "MV Konkan Carrier", mmsi: "419000222" }),
    featurePoint([72.68, 18.93], { rank: 3, score: 57, name: "MT Dakshin Star", mmsi: "419000333" }),
    featurePoint([73.18, 18.66], { rank: 4, score: 32, name: "OSV West Coast", mmsi: "419000444" }),
    featurePoint([72.52, 19.06], { rank: 5, score: 29, name: "MV Malabar Route", mmsi: "419000555" })
  ]
};

const trackFeatures: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [
    featureLine([[72.51, 18.48], [72.64, 18.62], [72.82, 18.79], [73.02, 18.94]], { rank: 1 }),
    featureLine([[72.52, 18.95], [72.71, 18.84], [72.96, 18.71], [73.23, 18.62]], { rank: 2 }),
    featureLine([[72.31, 19.08], [72.52, 19.02], [72.68, 18.93], [72.86, 18.82]], { rank: 3 }),
    featureLine([[72.88, 18.43], [73.03, 18.56], [73.18, 18.66], [73.36, 18.71]], { rank: 4 }),
    featureLine([[72.22, 19.22], [72.38, 19.14], [72.52, 19.06], [72.74, 18.97]], { rank: 5 })
  ]
};

// ---------------------------------------------------------------------------
// Phase -> visible layer map. Note every later phase keeps the earlier
// phase's layers in the list (hindcast-line stays listed all the way through
// "ranking") - the disappearing-hindcast bug was a z-order/opacity problem,
// not a visibility-list problem, and is fixed by draw order + halo below.
// ---------------------------------------------------------------------------

const phaseLayers: Record<OperationPhase, string[]> = {
  monitoring: ["india-eez-fill", "india-eez-line"],
  eez: ["india-eez-fill", "india-eez-line", "scene-footprint-fill", "scene-footprint-line"],
  detection: ["india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid"],
  hindcast: [
    "india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid",
    "source-fill", "source-line", "hindcast-line-halo", "hindcast-line"
  ],
  forecast: [
    "india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid",
    "source-fill", "source-line", "forecast-fill-50", "forecast-fill-80", "forecast-fill-95", "forecast-outline-95",
    "hindcast-line-halo", "hindcast-line"
  ],
  ais: [
    "india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid",
    "source-fill", "source-line", "forecast-fill-50", "forecast-fill-80", "forecast-fill-95", "forecast-outline-95",
    "hindcast-line-halo", "hindcast-line", "vessel-tracks", "vessel-markers", "vessel-rank-labels"
  ],
  ranking: [
    "india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid",
    "source-fill", "source-line", "forecast-fill-50", "forecast-fill-80", "forecast-fill-95", "forecast-outline-95",
    "hindcast-line-halo", "hindcast-line", "vessel-tracks", "vessel-markers", "vessel-rank-labels"
  ]
};

const ALL_LAYER_IDS = Array.from(new Set(Object.values(phaseLayers).flat().concat("case-aoi-line")));

const FORECAST_TARGET_OPACITY: Record<string, number> = {
  "forecast-fill-50": 0.34,
  "forecast-fill-80": 0.24,
  "forecast-fill-95": 0.14
};

function phaseHasHindcast(phase: OperationPhase) {
  return phase === "hindcast" || phase === "forecast" || phase === "ais" || phase === "ranking";
}
function phaseHasForecast(phase: OperationPhase) {
  return phase === "forecast" || phase === "ais" || phase === "ranking";
}

// ---------------------------------------------------------------------------
// Fully offline base style. The previous version depended on live raster
// tiles from a public CDN - on a locked-down network (common at demo venues)
// those requests silently fail and the map area stays blank. Everything here
// is generated locally, so the map always renders regardless of network.
// ---------------------------------------------------------------------------

function buildOfflineStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: "ocean-background", type: "background", paint: { "background-color": "#DCEEF7" } }
    ]
  };
}

function buildGraticule(bounds: [[number, number], [number, number]], step = 5): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let lon = Math.ceil(minLon / step) * step; lon <= maxLon; lon += step) {
    features.push(featureLine([[lon, minLat], [lon, maxLat]], {}));
  }
  for (let lat = Math.ceil(minLat / step) * step; lat <= maxLat; lat += step) {
    features.push(featureLine([[minLon, lat], [maxLon, lat]], {}));
  }
  return { type: "FeatureCollection", features };
}

export function MapCanvas({ caseAoi, embedded = false, phase = "eez" }: { caseAoi?: GeoJSON.Polygon; embedded?: boolean; phase?: OperationPhase }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<{ hindcast?: maplibregl.Marker; forecast?: maplibregl.Marker }>({});
  const prevPhaseRef = useRef<OperationPhase | null>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;

    const map = new maplibregl.Map({
      container,
      style: buildOfflineStyle(),
      center: [80.5, 14.8],
      zoom: 4.3,
      attributionControl: false
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("error", (event) => {
      // Surface style/source problems in the console instead of a silent blank map.
      // eslint-disable-next-line no-console
      console.error("[MapCanvas] maplibre error:", event.error?.message ?? event);
    });

    map.on("load", () => {
      addLayers(map, caseAoi);
      installHoverPopups(map);
      markersRef.current = installLabelMarkers(map);
      fitPhase(map, phase);
      applyPhase(map, phase, prevPhaseRef.current, markersRef.current, cancelAnimRef, false);
      prevPhaseRef.current = phase;
    });

    // A grid layout can settle its size a frame or two after mount; a single
    // rAF resize is not always enough. Watch the container continuously so
    // the canvas is never stuck at a stale (sometimes 0x0) size.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimRef.current?.();
      Object.values(markersRef.current).forEach((marker) => marker?.remove());
      map.remove();
      mapRef.current = null;
      prevPhaseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseAoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    fitPhase(map, phase);
    applyPhase(map, phase, prevPhaseRef.current, markersRef.current, cancelAnimRef, true);
    prevPhaseRef.current = phase;
  }, [phase, caseAoi]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-neutral-100 ${embedded ? "min-h-full" : "min-h-[calc(100vh-104px)]"}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {!embedded && (
        <>
          <MapControls />
          <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2 rounded-md border border-neutral-200 bg-neutral-0 p-3 shadow-elevation-1">
            <span className="rounded-full bg-navy-900"><DataSourceModeBadge mode="live" /></span>
            <span className="font-mono text-caption text-neutral-700">India EEZ operational window</span>
          </div>
          <MapLegend />
          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-neutral-0/95 px-6 py-3">
            <TimelineStrip phase={phase} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer construction. Order below is draw order (later = on top) - this is
// the fix for "hindcast disappears once forecast starts": the hindcast line
// (plus a white halo for contrast) is now added AFTER the forecast fill/line
// layers, so it always renders above the forecast envelope instead of being
// painted over by it.
// ---------------------------------------------------------------------------

function addLayers(map: Map, caseAoi?: GeoJSON.Polygon) {
  map.addSource("graticule", { type: "geojson", data: buildGraticule(INDIA_EEZ_BOUNDS) });
  map.addLayer({ id: "graticule-line", type: "line", source: "graticule", paint: { "line-color": "#B9D3E6", "line-width": 0.6, "line-opacity": 0.5 } });

  map.addSource("india-land-context", { type: "geojson", data: featureMultiPolygon(indiaLandContext) });
  map.addLayer({ id: "india-land-fill", type: "fill", source: "india-land-context", paint: { "fill-color": "#F5F7F5", "fill-opacity": 0.95 } });
  map.addLayer({ id: "india-land-line", type: "line", source: "india-land-context", paint: { "line-color": "#9CA3AF", "line-width": 1.2 } });

  map.addSource("india-eez", { type: "geojson", data: featurePolygon(indiaEezOutline, { label: "India EEZ operational window" }) });
  map.addLayer({ id: "india-eez-fill", type: "fill", source: "india-eez", paint: { "fill-color": "#D9EFFF", "fill-opacity": 0.42 } }, "india-land-fill");
  map.addLayer({ id: "india-eez-line", type: "line", source: "india-eez", paint: { "line-color": "#1D4E89", "line-width": 2.8, "line-dasharray": [2, 2] } });

  map.addSource("case-aoi", { type: "geojson", data: featurePolygon(caseAoi ?? operationalCase.aoi as GeoJSON.Polygon, { label: "Case AOI", detail: "Arabian Sea investigation window" }) });
  map.addLayer({ id: "case-aoi-line", type: "line", source: "case-aoi", paint: { "line-color": "#1D4E89", "line-width": 1.5, "line-dasharray": [1, 1] } });

  map.addSource("scene-footprint", { type: "geojson", data: featurePolygon(sceneFootprint, { label: "SAR scene footprint", detail: "Validated inside India EEZ" }) });
  map.addLayer({ id: "scene-footprint-fill", type: "fill", source: "scene-footprint", paint: { "fill-color": "#E0F2FE", "fill-opacity": 0.38 } });
  map.addLayer({ id: "scene-footprint-line", type: "line", source: "scene-footprint", paint: { "line-color": "#0284C7", "line-width": 2.2 } });

  map.addSource("slicks", { type: "geojson", data: { type: "Feature", properties: { label: "Oil slick polygon", detail: `Confidence ${operationalSlick.confidence}` }, geometry: operationalSlick.geometry as GeoJSON.MultiPolygon } });
  map.addLayer({ id: "slick-fill", type: "fill", source: "slicks", paint: { "fill-color": "#262626", "fill-opacity": 0.68 } });
  map.addLayer({ id: "slick-line", type: "line", source: "slicks", paint: { "line-color": "#0F172A", "line-width": 2.8 } });

  map.addSource("slick-centroid-source", { type: "geojson", data: featurePoint(operationalSlick.centroid.coordinates as [number, number], { label: "Oil slick centroid", detail: "73.045, 18.915" }) });
  map.addLayer({ id: "slick-centroid", type: "circle", source: "slick-centroid-source", paint: { "circle-color": "#FFFFFF", "circle-radius": 4, "circle-stroke-color": "#111827", "circle-stroke-width": 2 } });

  map.addSource("source-region", { type: "geojson", data: featurePolygon(operationalSource.probable_source_region as GeoJSON.Polygon, { label: "Hindcast source region", detail: "Release window 24 Aug 06:00-25 Aug 18:00" }) });
  map.addLayer({ id: "source-fill", type: "fill", source: "source-region", paint: { "fill-color": "#0EA5E9", "fill-opacity": 0.3, "fill-opacity-transition": { duration: 600, delay: 0 } } });
  map.addLayer({ id: "source-line", type: "line", source: "source-region", paint: { "line-color": "#0369A1", "line-width": 3.4 } });

  // Forecast contours BELOW hindcast on purpose (see note above the function).
  const centroid = operationalSlick.centroid.coordinates as [number, number];
  map.addSource("forecast", { type: "geojson", data: buildForecastContours(operationalForecast.contours[0].polygon as GeoJSON.Polygon, centroid) });
  ([50, 80, 95] as const).forEach((percentile) => {
    map.addLayer({
      id: `forecast-fill-${percentile}`,
      type: "fill",
      source: "forecast",
      filter: ["==", ["get", "percentile"], percentile],
      paint: {
        "fill-color": "#F97316",
        "fill-opacity": FORECAST_TARGET_OPACITY[`forecast-fill-${percentile}`],
        "fill-opacity-transition": { duration: 700, delay: 0 }
      }
    });
  });
  map.addLayer({
    id: "forecast-outline-95",
    type: "line",
    source: "forecast",
    filter: ["==", ["get", "percentile"], 95],
    paint: { "line-color": "#EA580C", "line-width": 2.6, "line-dasharray": [1, 1.4], "line-opacity": 0.9, "line-opacity-transition": { duration: 700, delay: 0 } }
  });

  // Hindcast trajectory: added last (on top) with a white halo underneath for
  // contrast, and starts as a single point - it is grown into the full path
  // by animateHindcastGrowth() the first time the "hindcast" phase is entered.
  map.addSource("hindcast", { type: "geojson", data: featureLine([hindcastCoords[0]], { label: "Euler hindcast trajectory", detail: "Backward drift to probable source" }) });
  map.addLayer({ id: "hindcast-line-halo", type: "line", source: "hindcast", paint: { "line-color": "#FFFFFF", "line-width": 7, "line-opacity": 0.85 } });
  map.addLayer({ id: "hindcast-line", type: "line", source: "hindcast", paint: { "line-color": "#2563EB", "line-width": 4, "line-opacity": 0.95, "line-dasharray": [2, 1] } });

  map.addSource("vessel-tracks-source", { type: "geojson", data: trackFeatures });
  map.addLayer({
    id: "vessel-tracks",
    type: "line",
    source: "vessel-tracks-source",
    paint: {
      "line-color": ["case", ["<=", ["get", "rank"], 3], "#B3261E", "#6B7280"],
      "line-opacity": ["case", ["<=", ["get", "rank"], 3], 0.82, 0.42],
      "line-width": ["case", ["<=", ["get", "rank"], 3], 2.5, 1.5]
    }
  });

  map.addSource("vessels", { type: "geojson", data: vesselFeatures });
  map.addLayer({
    id: "vessel-markers",
    type: "circle",
    source: "vessels",
    paint: {
      "circle-color": ["case", ["<=", ["get", "rank"], 3], "#B3261E", "#FFFFFF"],
      "circle-radius": ["case", ["<=", ["get", "rank"], 3], 8, 6],
      "circle-stroke-width": 2,
      "circle-stroke-color": ["case", ["<=", ["get", "rank"], 3], "#FFFFFF", "#6B7280"]
    }
  });
  // Rank number only, always on - the vessel NAME is intentionally reserved
  // for the hover popup (installHoverPopups) so the map stays readable and
  // names are surfaced "explicitly on hover" as requested.
  map.addLayer({
    id: "vessel-rank-labels",
    type: "symbol",
    source: "vessels",
    layout: { "text-field": ["concat", "#", ["get", "rank"]], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-font": ["Open Sans Bold"] },
    paint: { "text-color": "#111827", "text-halo-color": "#FFFFFF", "text-halo-width": 1.4 }
  });
}

function buildForecastContours(basePolygon: GeoJSON.Polygon, centroid: [number, number]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const ring = basePolygon.coordinates[0] as [number, number][];
  const labels: Record<50 | 80 | 95, string> = { 50: "Forecast 50% contour", 80: "Forecast 80% contour", 95: "Forecast 95% contour" };
  const features = ([50, 80, 95] as const).map((percentile) => {
    const scaled = scaleRingAroundPoint(ring, centroid, forecastScaleByPercentile[percentile]);
    return featurePolygon({ type: "Polygon", coordinates: [scaled] }, {
      percentile,
      label: labels[percentile],
      detail: "95% spread contour, next 48 hours"
    });
  });
  return { type: "FeatureCollection", features };
}

function scaleRingAroundPoint(ring: [number, number][], center: [number, number], factor: number): [number, number][] {
  return ring.map(([x, y]) => [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor]);
}

function centroidOfRing(ring: [number, number][]): [number, number] {
  const pts = ring.slice(0, -1);
  const sum = pts.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

// ---------------------------------------------------------------------------
// DOM markers (real lng/lat anchored, so they never drift out of place when
// the map pans or zooms - unlike the old fixed-percentage CSS overlay).
// ---------------------------------------------------------------------------

function installLabelMarkers(map: Map) {
  const sourceCentroid = centroidOfRing(operationalSource.probable_source_region.coordinates[0] as [number, number][]);
  const hindcastLabel = document.createElement("div");
  hindcastLabel.className = "map-chip map-chip-hindcast";
  hindcastLabel.textContent = "Probable source: 24 Aug 06:00-25 Aug 18:00";
  const hindcastMarker = new maplibregl.Marker({ element: hindcastLabel, anchor: "bottom" }).setLngLat(sourceCentroid).addTo(map);

  const forecastRing = scaleRingAroundPoint(operationalForecast.contours[0].polygon.coordinates[0] as [number, number][], operationalSlick.centroid.coordinates as [number, number], forecastScaleByPercentile[95]);
  const forecastCentroid = centroidOfRing(forecastRing);
  const forecastLabel = document.createElement("div");
  forecastLabel.className = "map-chip map-chip-forecast";
  forecastLabel.textContent = "Forecast +48h";
  const forecastMarker = new maplibregl.Marker({ element: forecastLabel, anchor: "top" }).setLngLat([forecastCentroid[0] + 0.18, forecastCentroid[1] + 0.1]).addTo(map);

  hindcastLabel.style.display = "none";
  forecastLabel.style.display = "none";

  return { hindcast: hindcastMarker, forecast: forecastMarker };
}

function updateMarkerVisibility(markers: { hindcast?: maplibregl.Marker; forecast?: maplibregl.Marker }, phase: OperationPhase) {
  const hindcastEl = markers.hindcast?.getElement();
  const forecastEl = markers.forecast?.getElement();
  if (hindcastEl) hindcastEl.style.display = phaseHasHindcast(phase) ? "block" : "none";
  if (forecastEl) forecastEl.style.display = phaseHasForecast(phase) ? "block" : "none";
}

// ---------------------------------------------------------------------------
// Animation: growing the hindcast line and staggering the forecast contours
// in, instead of the previous "just switch phases and hope" approach.
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sliceLine(coords: [number, number][], t: number): [number, number][] {
  if (t >= 1) return coords;
  const distances: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    distances.push(d);
    total += d;
  }
  if (total === 0) return coords;
  let remaining = t * total;
  const out: [number, number][] = [coords[0]];
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i]) {
      const segT = distances[i] === 0 ? 0 : remaining / distances[i];
      out.push([lerp(coords[i][0], coords[i + 1][0], segT), lerp(coords[i][1], coords[i + 1][1], segT)]);
      return out;
    }
    out.push(coords[i + 1]);
    remaining -= distances[i];
  }
  return out;
}

function animateHindcastGrowth(map: Map, durationMs = 1600) {
  let raf = 0;
  let start: number | null = null;
  let cancelled = false;

  function tick(ts: number) {
    if (cancelled) return;
    if (start === null) start = ts;
    const t = Math.min((ts - start) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const source = map.getSource("hindcast") as GeoJSONSource | undefined;
    source?.setData(featureLine(sliceLine(hindcastCoords, eased), { label: "Euler hindcast trajectory", detail: "Backward drift to probable source" }));
    if (t < 1) raf = window.requestAnimationFrame(tick);
  }
  raf = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
  };
}

function setHindcastComplete(map: Map) {
  const source = map.getSource("hindcast") as GeoJSONSource | undefined;
  source?.setData(featureLine(hindcastCoords, { label: "Euler hindcast trajectory", detail: "Backward drift to probable source" }));
}

function animateForecastReveal(map: Map) {
  const steps: Array<[string, number]> = [["forecast-fill-50", 0], ["forecast-fill-80", 260], ["forecast-fill-95", 520]];
  steps.forEach(([layerId, delay]) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, "fill-opacity", 0);
    window.setTimeout(() => {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, "fill-opacity", FORECAST_TARGET_OPACITY[layerId]);
    }, delay);
  });
  if (map.getLayer("forecast-outline-95")) {
    map.setPaintProperty("forecast-outline-95", "line-opacity", 0);
    window.setTimeout(() => {
      if (map.getLayer("forecast-outline-95")) map.setPaintProperty("forecast-outline-95", "line-opacity", 0.9);
    }, 520);
  }
}

function setForecastComplete(map: Map) {
  Object.entries(FORECAST_TARGET_OPACITY).forEach(([layerId, opacity]) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, "fill-opacity", opacity);
  });
  if (map.getLayer("forecast-outline-95")) map.setPaintProperty("forecast-outline-95", "line-opacity", 0.9);
}

// ---------------------------------------------------------------------------
// Orchestration - decides, on every phase change, whether to play the growth
// animation (only the moment a phase is freshly entered) or just snap to its
// resolved end-state (arriving directly on a later stage, e.g. by clicking
// "ranking" straight away). Either way the previous stage's layers are left
// exactly as they were: nothing is torn down between stages any more.
// ---------------------------------------------------------------------------

function applyPhase(
  map: Map,
  phase: OperationPhase,
  previousPhase: OperationPhase | null,
  markers: { hindcast?: maplibregl.Marker; forecast?: maplibregl.Marker },
  cancelAnimRef: MutableRefObject<(() => void) | null>,
  isTransition: boolean
) {
  setLayerVisibility(map, phase);
  updateMarkerVisibility(markers, phase);

  cancelAnimRef.current?.();
  cancelAnimRef.current = null;

  const enteringHindcast = phase === "hindcast" && (!isTransition || previousPhase !== "hindcast");
  const enteringForecast = phase === "forecast" && (!isTransition || previousPhase !== "forecast");

  if (enteringHindcast) {
    cancelAnimRef.current = animateHindcastGrowth(map);
  } else if (phaseHasHindcast(phase)) {
    setHindcastComplete(map);
  }

  if (enteringForecast) {
    animateForecastReveal(map);
  } else if (phaseHasForecast(phase)) {
    setForecastComplete(map);
  }
}

function setLayerVisibility(map: Map, phase: OperationPhase) {
  const visible = new Set(phaseLayers[phase]);
  ALL_LAYER_IDS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    const isVisible = layerId === "case-aoi-line" ? phase !== "monitoring" : visible.has(layerId);
    map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
  });
}

function fitPhase(map: Map, phase: OperationPhase) {
  map.fitBounds(INDIA_EEZ_BOUNDS, { padding: phase === "monitoring" || phase === "eez" ? 50 : 70, animate: true, duration: 600 });
}

function installHoverPopups(map: Map) {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  const hoverLayerConfig: Record<string, { title: string; color: string }> = {
    "india-eez-fill": { title: "India EEZ", color: "#1D4E89" },
    "scene-footprint-fill": { title: "SAR scene footprint", color: "#0284C7" },
    "slick-fill": { title: "Oil slick polygon", color: "#111827" },
    "slick-centroid": { title: "Slick centroid", color: "#111827" },
    "source-fill": { title: "Hindcast source region", color: "#0369A1" },
    "hindcast-line": { title: "Euler hindcast trajectory", color: "#2563EB" },
    "forecast-fill-50": { title: "Forecast - 50% contour", color: "#EA580C" },
    "forecast-fill-80": { title: "Forecast - 80% contour", color: "#EA580C" },
    "forecast-fill-95": { title: "Forecast - 95% contour", color: "#EA580C" },
    "vessel-markers": { title: "Vessel", color: "#B3261E" }
  };

  Object.keys(hoverLayerConfig).forEach((layerId) => {
    map.on("mouseenter", layerId, (event) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      popup.setLngLat(event.lngLat).setHTML(popupHtml(hoverLayerConfig[layerId], feature?.properties)).addTo(map);
    });
    map.on("mousemove", layerId, (event) => {
      popup.setLngLat(event.lngLat);
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  });
}

function popupHtml(config: { title: string; color: string }, properties: GeoJSON.GeoJsonProperties | undefined) {
  const name = properties?.name ? String(properties.name) : null;
  const heading = name ?? String(properties?.label ?? config.title);
  const mmsi = properties?.mmsi ? `<div>MMSI ${properties.mmsi}</div>` : "";
  const detail = properties?.detail ? `<div>${properties.detail}</div>` : "";
  const rank = properties?.rank ? `<div>Rank #${properties.rank}${properties.score ? ` - score ${properties.score}` : ""}</div>` : "";
  return `<div class="map-popup" style="border-left-color:${config.color}"><span class="map-popup-kicker" style="color:${config.color}">${config.title}</span><strong>${heading}</strong>${mmsi}${detail}${rank}</div>`;
}

function TimelineStrip({ phase }: { phase: OperationPhase }) {
  const labels: Record<OperationPhase, string> = {
    monitoring: "Automatic SAR ingestion",
    eez: "India EEZ validation",
    detection: "Oil spill detection",
    hindcast: "Hindcast: release window",
    forecast: "Forecast: next 48 hours",
    ais: "AIS correlation",
    ranking: "Transparent suspect ranking"
  };
  const label = labels[phase];
  return (
    <div className="grid grid-cols-[190px_1fr_150px] items-center gap-4 text-caption">
      <div className="font-mono text-neutral-700">20 Aug - 27 Aug 2026</div>
      <input aria-label={label} className="w-full accent-navy-900" type="range" min={0} max={48} step={6} value={phase === "forecast" || phase === "ais" || phase === "ranking" ? 48 : phase === "hindcast" ? 24 : 0} readOnly />
      <div className="text-right text-neutral-500">{label}</div>
    </div>
  );
}

function featurePolygon(geometry: GeoJSON.Polygon, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.Polygon> {
  return { type: "Feature", properties, geometry };
}

function featureMultiPolygon(geometry: GeoJSON.MultiPolygon): GeoJSON.Feature<GeoJSON.MultiPolygon> {
  return { type: "Feature", properties: {}, geometry };
}

function featurePoint(coordinates: [number, number], properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature<GeoJSON.Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

function featureLine(coordinates: [number, number][], properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
}