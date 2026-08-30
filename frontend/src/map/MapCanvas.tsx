import "leaflet/dist/leaflet.css";

import L, { type LatLngBoundsExpression, type Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

import { DataSourceModeBadge } from "../components/shared/DataSourceModeBadge";
import { operationalCase, operationalForecast, operationalSlick, operationalSource } from "../data/operational";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";

export type OperationPhase = "monitoring" | "eez" | "detection" | "hindcast" | "forecast" | "ais" | "ranking";

type LngLat = [number, number];
type LayerBucket = "base" | "scene" | "detection" | "hindcast" | "forecast" | "ais" | "suspects";

const INDIA_BOUNDS: LatLngBoundsExpression = [[5.0, 66.0], [25.0, 95.0]];
const CASE_BOUNDS: LatLngBoundsExpression = [[15.12, 67.62], [17.05, 69.9]];
const sceneFootprint: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[67.75, 15.28], [69.65, 15.28], [69.65, 16.92], [67.75, 16.92], [67.75, 15.28]]] };
const indiaEezOutline: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[66.5, 5.5], [94.5, 5.5], [94.5, 24.5], [66.5, 24.5], [66.5, 5.5]]] };
const indiaLand: GeoJSON.MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [[
      [68.1, 23.8], [69.1, 22.7], [70.1, 21.3], [70.4, 20.1], [71.0, 18.8], [72.0, 17.0], [72.7, 15.7],
      [73.3, 14.5], [74.2, 13.2], [74.8, 12.1], [75.6, 10.7], [76.8, 8.5], [77.8, 8.1], [78.9, 9.3],
      [79.8, 11.6], [80.5, 13.4], [80.2, 15.7], [81.1, 17.6], [82.4, 18.8], [84.0, 19.7], [85.8, 20.7],
      [87.3, 21.6], [88.8, 22.1], [89.2, 23.3], [88.0, 24.2], [85.8, 24.7], [82.8, 24.4], [79.5, 24.9],
      [76.8, 24.5], [74.0, 24.1], [71.2, 24.6], [68.1, 23.8]
    ]],
    [[[79.7, 9.7], [80.4, 8.9], [81.1, 7.7], [81.7, 6.9], [81.3, 6.0], [80.3, 5.9], [79.7, 6.8], [79.4, 8.3], [79.7, 9.7]]]
  ]
};

const hindcastCoords: LngLat[] = [[68.94, 16.18], [68.7, 16.06], [68.43, 15.91], [68.13, 15.69]];
const vessels = [
  { rank: 1, score: 78, name: "MV Samudra Prerna", mmsi: "419000111", point: [68.47, 15.98] as LngLat, track: [[68.08, 15.64], [68.24, 15.82], [68.47, 15.98], [68.74, 16.13]] as LngLat[] },
  { rank: 2, score: 61, name: "MV Konkan Carrier", mmsi: "419000222", point: [68.65, 15.86] as LngLat, track: [[68.22, 16.38], [68.42, 16.1], [68.65, 15.86], [69.03, 15.73]] as LngLat[] },
  { rank: 3, score: 57, name: "MT Dakshin Star", mmsi: "419000333", point: [68.37, 16.16] as LngLat, track: [[67.98, 16.49], [68.19, 16.31], [68.37, 16.16], [68.62, 15.99]] as LngLat[] },
  { rank: 4, score: 32, name: "OSV West Coast", mmsi: "419000444", point: [69.21, 15.88] as LngLat, track: [[68.84, 15.62], [69.02, 15.76], [69.21, 15.88], [69.48, 15.93]] as LngLat[] },
  { rank: 5, score: 29, name: "MV Malabar Route", mmsi: "419000555", point: [68.18, 16.56] as LngLat, track: [[67.82, 16.82], [68.02, 16.7], [68.18, 16.56], [68.48, 16.42]] as LngLat[] }
];

const phaseBuckets: Record<OperationPhase, LayerBucket[]> = {
  monitoring: ["base"],
  eez: ["base", "scene"],
  detection: ["base", "scene", "detection"],
  hindcast: ["base", "scene", "detection", "hindcast"],
  forecast: ["base", "scene", "detection", "hindcast", "forecast"],
  ais: ["base", "scene", "detection", "hindcast", "forecast", "ais"],
  ranking: ["base", "scene", "detection", "hindcast", "forecast", "suspects"]
};

export function MapCanvas({ caseAoi, embedded = false, phase = "eez" }: { caseAoi?: GeoJSON.Polygon; embedded?: boolean; phase?: OperationPhase }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerGroupsRef = useRef<Record<LayerBucket, L.LayerGroup> | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: true,
      preferCanvas: false,
      zoomSnap: 0.25,
      wheelDebounceTime: 80
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      subdomains: "abcd",
      detectRetina: true,
      crossOrigin: true
    }).addTo(map);

    layerGroupsRef.current = createLayerGroups(map, caseAoi);
    applyPhase(map, layerGroupsRef.current, phase);
    fitPhase(map, phase);

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupsRef.current = null;
    };
  }, [caseAoi]);

  useEffect(() => {
    const map = mapRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups) return;
    applyPhase(map, groups, phase);
    fitPhase(map, phase);
  }, [phase]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#DCEEF7] ${embedded ? "min-h-full" : "min-h-[calc(100vh-104px)]"}`}>
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {!embedded && (
        <>
          <MapControls />
          <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2 rounded-md border border-neutral-200 bg-neutral-0/95 p-3 shadow-elevation-1 backdrop-blur">
            <span className="rounded-full bg-navy-900"><DataSourceModeBadge mode="live" /></span>
            <span className="font-mono text-caption text-neutral-700">Leaflet + Carto basemap</span>
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

function createLayerGroups(map: LeafletMap, caseAoi?: GeoJSON.Polygon): Record<LayerBucket, L.LayerGroup> {
  const groups: Record<LayerBucket, L.LayerGroup> = {
    base: L.layerGroup(),
    scene: L.layerGroup(),
    detection: L.layerGroup(),
    hindcast: L.layerGroup(),
    forecast: L.layerGroup(),
    ais: L.layerGroup(),
    suspects: L.layerGroup()
  };

  addGrid(groups.base);
  L.geoJSON(indiaEezOutline, { pane: "overlayPane", style: { color: "#1D4E89", weight: 3, dashArray: "8 8", fillColor: "#D9EFFF", fillOpacity: 0.14 } })
    .bindTooltip(tooltipHtml("India EEZ", ["Operational jurisdiction window"]), stickyTooltip())
    .addTo(groups.base);
  L.geoJSON(indiaLand, { interactive: false, style: { color: "#94A3B8", weight: 1.2, fillColor: "#F8FAFC", fillOpacity: 0.45 } }).addTo(groups.base);

  L.geoJSON(caseAoi ?? operationalCase.aoi as GeoJSON.Polygon, { style: { color: "#1D4E89", weight: 2.5, dashArray: "5 5", fillOpacity: 0, className: "leaflet-hover-path" } }).addTo(groups.scene);
  L.geoJSON(sceneFootprint, { style: { color: "#0284C7", weight: 3, fillColor: "#E0F2FE", fillOpacity: 0.42, className: "leaflet-hover-path" } })
    .bindTooltip(tooltipHtml("SAR scene footprint", ["Validated inside India EEZ"]), stickyTooltip())
    .addTo(groups.scene);

  const slickRing = (operationalSlick.geometry.coordinates[0][0] as LngLat[]);
  L.polygon(toLatLngs(slickRing), { color: "#111827", weight: 3.5, fillColor: "#262626", fillOpacity: 0.58, className: "leaflet-slick-draw leaflet-hover-path" })
    .bindTooltip(tooltipHtml("Drawn oil slick mask", [`Confidence ${operationalSlick.confidence}`, "Hand-traced reveal from SAR contrast", "Area 142.4 km2"]), stickyTooltip())
    .addTo(groups.detection);
  L.circleMarker(toLatLng(operationalSlick.centroid.coordinates as LngLat), { radius: 5, color: "#111827", weight: 2, fillColor: "#FFFFFF", fillOpacity: 1, className: "leaflet-hover-marker" }).addTo(groups.detection);

  const sourceCenter = polygonCenter(operationalSource.probable_source_region.coordinates[0] as LngLat[]);
  addHindcastCopies(groups.hindcast, slickRing, operationalSlick.centroid.coordinates as LngLat, sourceCenter);
  L.geoJSON(operationalSource.probable_source_region as GeoJSON.Polygon, { style: { color: "#0369A1", weight: 3, fillColor: "#0EA5E9", fillOpacity: 0.3, className: "leaflet-source-save leaflet-hover-path" } })
    .bindTooltip(tooltipHtml("Saved source location", ["Contracted from slick copy", "Release window 24 Aug 06:00-25 Aug 18:00"]), stickyTooltip())
    .addTo(groups.hindcast);
  L.polyline(toLatLngs(hindcastCoords), { color: "#FFFFFF", weight: 10, opacity: 0.95, className: "leaflet-hindcast-shadow" }).addTo(groups.hindcast);
  L.polyline(toLatLngs(hindcastCoords), { color: "#2563EB", weight: 5, dashArray: "12 8", opacity: 1, className: "leaflet-hindcast-flow leaflet-hover-path" })
    .bindTooltip(tooltipHtml("Euler hindcast trajectory", ["T-0h slick", "T-12h contraction", "T-24h saved source"]), stickyTooltip())
    .addTo(groups.hindcast);
  addTimeMarker(groups.hindcast, [68.7, 16.06], "T-8h", "hindcast");
  addTimeMarker(groups.hindcast, [68.43, 15.91], "T-16h", "hindcast");
  addTimeMarker(groups.hindcast, sourceCenter, "T-24h", "hindcast");

  const forecastBase = operationalForecast.contours[0].polygon.coordinates[0] as LngLat[];
  const centroid = operationalSlick.centroid.coordinates as LngLat;
  addForecastContour(groups.forecast, forecastBase, centroid, 0.42, "12h", "#CA8A04", "#FACC15", 0.26, "0s");
  addForecastContour(groups.forecast, forecastBase, centroid, 0.64, "24h", "#EA580C", "#FB923C", 0.22, "0.7s");
  addForecastContour(groups.forecast, forecastBase, centroid, 0.88, "36h", "#DC2626", "#F87171", 0.18, "1.4s");
  addForecastContour(groups.forecast, forecastBase, centroid, 1.14, "48h", "#991B1B", "#EF4444", 0.14, "2.1s");
  addTimeMarker(groups.forecast, [69.23, 15.93], "+24h", "forecast");
  addTimeMarker(groups.forecast, [69.52, 16.65], "+48h", "forecast");

  vessels.forEach((vessel) => {
    const hot = vessel.rank <= 3;
    L.polyline(toLatLngs(vessel.track), { color: hot ? "#B3261E" : "#6B7280", weight: hot ? 3 : 2.5, opacity: hot ? 0.78 : 0.42, dashArray: hot ? "2 12" : "2 10", lineCap: "round", className: "leaflet-vessel-track leaflet-hover-path" }).addTo(groups.ais);
    L.marker(toLatLng(vessel.point), { icon: vesselIcon(vessel.rank, hot), riseOnHover: true })
      .bindTooltip(tooltipHtml(vessel.name, [`MMSI ${vessel.mmsi}`, hot ? `Possible suspect #${vessel.rank}` : "Scanned AIS contact", `Score ${vessel.score}`]), stickyTooltip())
      .addTo(groups.ais);
    if (hot) {
      L.polyline(toLatLngs(vessel.track), { color: "#B3261E", weight: 4, opacity: 0.86, dashArray: "2 13", lineCap: "round", className: "leaflet-vessel-track leaflet-suspect-track leaflet-hover-path" }).addTo(groups.suspects);
      L.marker(toLatLng(vessel.point), { icon: vesselIcon(vessel.rank, true), riseOnHover: true })
        .bindTooltip(tooltipHtml(`Suspect #${vessel.rank}: ${vessel.name}`, [`MMSI ${vessel.mmsi}`, `Score ${vessel.score}`, "Shortlisted for investigator review"]), stickyTooltip())
        .addTo(groups.suspects);
    }
  });

  Object.values(groups).forEach((group) => group.addTo(map));
  return groups;
}

function applyPhase(map: LeafletMap, groups: Record<LayerBucket, L.LayerGroup>, phase: OperationPhase) {
  const visible = new Set(phaseBuckets[phase]);
  Object.entries(groups).forEach(([bucket, group]) => {
    if (visible.has(bucket as LayerBucket)) {
      if (!map.hasLayer(group)) group.addTo(map);
    } else if (map.hasLayer(group)) {
      group.removeFrom(map);
    }
  });
}

function fitPhase(map: LeafletMap, phase: OperationPhase) {
  const bounds = phase === "monitoring" || phase === "eez" ? INDIA_BOUNDS : CASE_BOUNDS;
  map.fitBounds(bounds, { padding: [44, 44], animate: false, maxZoom: phase === "monitoring" || phase === "eez" ? 5.25 : 7.5 });
}

function addGrid(group: L.LayerGroup) {
  for (let lon = 65; lon <= 95; lon += 5) L.polyline([[5, lon], [25, lon]], { color: "#B9D3E6", weight: 1, opacity: 0.55, interactive: false }).addTo(group);
  for (let lat = 5; lat <= 25; lat += 5) L.polyline([[lat, 65], [lat, 95]], { color: "#B9D3E6", weight: 1, opacity: 0.55, interactive: false }).addTo(group);
}

function addHindcastCopies(group: L.LayerGroup, slickRing: LngLat[], slickCenter: LngLat, sourceCenter: LngLat) {
  [
    { progress: 0.28, scale: 0.78, label: "T-8h", delay: "0.15s", warp: 0.08 },
    { progress: 0.6, scale: 0.52, label: "T-16h", delay: "1.05s", warp: 0.14 },
    { progress: 0.93, scale: 0.3, label: "T-24h", delay: "1.95s", warp: 0.2 }
  ].forEach((step) => {
    const center = interpolatePoint(slickCenter, sourceCenter, step.progress);
    const layer = L.polygon(toLatLngs(irregularScaleRing(slickRing, center, step.scale, step.warp)), {
      color: "#2563EB",
      weight: 2.6,
      fillColor: "#60A5FA",
      fillOpacity: 0.16,
      className: "leaflet-hindcast-copy leaflet-hover-path",
      dashArray: "7 7"
    } as L.PolylineOptions)
      .bindTooltip(tooltipHtml(`Contracting slick copy ${step.label}`, ["Backward drift interval", "Envelope narrows toward source"]), stickyTooltip())
      .addTo(group);
    const path = layer.getElement() as SVGElement | null;
    if (path) path.style.animationDelay = step.delay;
  });
}

function addForecastContour(group: L.LayerGroup, ring: LngLat[], center: LngLat, scale: number, label: string, color: string, fillColor: string, fillOpacity: number, delay: string) {
  const layer = L.polygon(toLatLngs(scaleRingAroundPoint(ring, center, scale)), { color, weight: 2.5, fillColor, fillOpacity, dashArray: label === "48h" ? "6 6" : undefined, className: "leaflet-forecast-spread leaflet-hover-path" })
    .bindTooltip(tooltipHtml(`Forecast spread ${label}`, [label === "48h" ? "Maximum 48 hour sea spread" : "Intermediate spread interval", "Forward drift from slick polygon"]), stickyTooltip())
    .addTo(group);
  const path = layer.getElement() as SVGElement | null;
  if (path) path.style.animationDelay = delay;
}

function addTimeMarker(group: L.LayerGroup, point: LngLat, label: string, tone: "hindcast" | "forecast") {
  L.marker(toLatLng(point), {
    icon: L.divIcon({
      className: "",
      html: `<span class="leaflet-time-chip leaflet-time-chip-${tone}">${label}</span>`,
      iconSize: [54, 22],
      iconAnchor: [27, 11]
    }),
    riseOnHover: true
  }).addTo(group);
}

function toLatLng([lng, lat]: LngLat): L.LatLngExpression {
  return [lat, lng];
}

function toLatLngs(points: LngLat[]): L.LatLngExpression[] {
  return points.map(toLatLng);
}

function scaleRingAroundPoint(ring: LngLat[], center: LngLat, factor: number): LngLat[] {
  return ring.map(([x, y]) => [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor]);
}

function irregularScaleRing(ring: LngLat[], center: LngLat, factor: number, warp: number): LngLat[] {
  return ring.map(([x, y], index) => {
    const localFactor = factor * (1 + (index % 2 === 0 ? warp : -warp * 0.55));
    return [center[0] + (x - center[0]) * localFactor, center[1] + (y - center[1]) * localFactor];
  });
}

function interpolatePoint(from: LngLat, to: LngLat, progress: number): LngLat {
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
}

function polygonCenter(ring: LngLat[]): LngLat {
  const points = ring.slice(0, -1);
  const total = points.reduce<LngLat>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function vesselIcon(rank: number, hot: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="leaflet-vessel-pin ${hot ? "leaflet-vessel-pin-hot" : "leaflet-vessel-pin-muted"}"><span class="leaflet-vessel-shape"></span><b>${rank}</b></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function stickyTooltip(): L.TooltipOptions {
  return { sticky: true, direction: "top", opacity: 1, className: "leaflet-spill-tooltip" };
}

function tooltipHtml(title: string, lines: string[]) {
  return `<div class="leaflet-spill-tooltip-inner"><strong>${title}</strong>${lines.map((line) => `<span>${line}</span>`).join("")}</div>`;
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
  return (
    <div className="grid grid-cols-[190px_1fr_150px] items-center gap-4 text-caption">
      <div className="font-mono text-neutral-700">20 Aug - 27 Aug 2026</div>
      <input aria-label={labels[phase]} className="w-full accent-navy-900" type="range" min={0} max={48} step={6} value={phase === "forecast" || phase === "ais" || phase === "ranking" ? 48 : phase === "hindcast" ? 24 : 0} readOnly />
      <div className="text-right text-neutral-500">{labels[phase]}</div>
    </div>
  );
}
