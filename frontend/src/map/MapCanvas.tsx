import "maplibre-gl/dist/maplibre-gl.css";

import { Ship } from "lucide-react";
import maplibregl, { Map, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { DataSourceModeBadge } from "../components/shared/DataSourceModeBadge";
import { operationalCase, operationalForecast, operationalSlick, operationalSource } from "../data/operational";
import { INDIA_EEZ_BOUNDS } from "./layers/base";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";

export type OperationPhase = "monitoring" | "eez" | "detection" | "hindcast" | "forecast" | "ais" | "ranking";

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

const vesselFeatures: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [
    featurePoint([72.82, 18.79], { rank: 1, score: 78, name: "MV Samudra Prerna" }),
    featurePoint([72.96, 18.71], { rank: 2, score: 61, name: "MV Konkan Carrier" }),
    featurePoint([72.68, 18.93], { rank: 3, score: 57, name: "MT Dakshin Star" }),
    featurePoint([73.18, 18.66], { rank: 4, score: 32, name: "OSV West Coast" }),
    featurePoint([72.52, 19.06], { rank: 5, score: 29, name: "MV Malabar Route" })
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

const phaseLayers: Record<OperationPhase, string[]> = {
  monitoring: ["india-eez-fill", "india-eez-line"],
  eez: ["india-eez-fill", "india-eez-line", "scene-footprint-fill", "scene-footprint-line"],
  detection: ["india-eez-fill", "india-eez-line", "scene-footprint-line", "slick-fill", "slick-line", "slick-centroid"],
  hindcast: ["india-eez-fill", "india-eez-line", "slick-fill", "slick-line", "source-fill", "source-line", "hindcast-line"],
  forecast: ["india-eez-fill", "india-eez-line", "slick-fill", "slick-line", "source-fill", "source-line", "forecast-fill", "forecast-line"],
  ais: ["india-eez-fill", "india-eez-line", "slick-fill", "slick-line", "source-fill", "source-line", "hindcast-line", "vessel-tracks", "vessel-markers"],
  ranking: ["india-eez-fill", "india-eez-line", "slick-fill", "slick-line", "source-fill", "source-line", "hindcast-line", "vessel-tracks", "vessel-markers"]
};

const investigationMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#E9EEF3" }
    },
    {
      id: "base-map",
      type: "raster",
      source: "osm-raster",
      paint: {
        "raster-opacity": 0.72,
        "raster-saturation": -0.45,
        "raster-contrast": -0.08
      }
    }
  ]
};

export function MapCanvas({ caseAoi, embedded = false, phase = "eez" }: { caseAoi?: GeoJSON.Polygon; embedded?: boolean; phase?: OperationPhase }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: investigationMapStyle,
      center: [80.5, 14.8],
      zoom: 4.3
    });
    mapRef.current = map;
    window.requestAnimationFrame(() => map.resize());
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      addLayers(map, caseAoi);
      fitPhase(map, phase);
      setLayerVisibility(map, phase);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [caseAoi]);

  useEffect(() => {
    if (!mapRef.current?.loaded()) return;
    setLayerVisibility(mapRef.current, phase);
    fitPhase(mapRef.current, phase);
  }, [phase, caseAoi]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-neutral-100 ${embedded ? "min-h-full" : "min-h-[calc(100vh-104px)]"}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {!embedded && <StageOverlay phase={phase} />}
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

function addLayers(map: Map, caseAoi?: GeoJSON.Polygon) {
  map.addSource("india-land-context", { type: "geojson", data: featureMultiPolygon(indiaLandContext) });
  map.addLayer({ id: "india-land-fill", type: "fill", source: "india-land-context", paint: { "fill-color": "#FFFFFF", "fill-opacity": 0.78 } });
  map.addLayer({ id: "india-land-line", type: "line", source: "india-land-context", paint: { "line-color": "#9CA3AF", "line-width": 1.2 } });

  map.addSource("india-eez", { type: "geojson", data: featurePolygon(indiaEezOutline) });
  map.addLayer({ id: "india-eez-fill", type: "fill", source: "india-eez", paint: { "fill-color": "#DDEAF7", "fill-opacity": 0.34 } }, "india-land-fill");
  map.addLayer({ id: "india-eez-line", type: "line", source: "india-eez", paint: { "line-color": "#1D4E89", "line-width": 2.8, "line-dasharray": [2, 2] } });

  map.addSource("case-aoi", { type: "geojson", data: featurePolygon(caseAoi ?? operationalCase.aoi as GeoJSON.Polygon) });
  map.addLayer({ id: "case-aoi-line", type: "line", source: "case-aoi", paint: { "line-color": "#1D4E89", "line-width": 1.5, "line-dasharray": [1, 1] } });

  map.addSource("scene-footprint", { type: "geojson", data: featurePolygon(sceneFootprint) });
  map.addLayer({ id: "scene-footprint-fill", type: "fill", source: "scene-footprint", paint: { "fill-color": "#EEF3FA", "fill-opacity": 0.36 } });
  map.addLayer({ id: "scene-footprint-line", type: "line", source: "scene-footprint", paint: { "line-color": "#1D4E89", "line-width": 2 } });

  map.addSource("slicks", { type: "geojson", data: { type: "Feature", properties: { confidence: operationalSlick.confidence }, geometry: operationalSlick.geometry as GeoJSON.MultiPolygon } });
  map.addLayer({ id: "slick-fill", type: "fill", source: "slicks", paint: { "fill-color": "#333333", "fill-opacity": 0.62 } });
  map.addLayer({ id: "slick-line", type: "line", source: "slicks", paint: { "line-color": "#111827", "line-width": 2.5 } });

  map.addSource("slick-centroid-source", { type: "geojson", data: featurePoint(operationalSlick.centroid.coordinates as [number, number], {}) });
  map.addLayer({ id: "slick-centroid", type: "circle", source: "slick-centroid-source", paint: { "circle-color": "#FFFFFF", "circle-radius": 4, "circle-stroke-color": "#111827", "circle-stroke-width": 2 } });

  map.addSource("source-region", { type: "geojson", data: featurePolygon(operationalSource.probable_source_region as GeoJSON.Polygon) });
  map.addLayer({ id: "source-fill", type: "fill", source: "source-region", paint: { "fill-color": "#17324D", "fill-opacity": 0.22 } });
  map.addLayer({ id: "source-line", type: "line", source: "source-region", paint: { "line-color": "#17324D", "line-width": 2.5 } });

  map.addSource("hindcast", { type: "geojson", data: featureLine([[73.05, 18.92], [72.99, 18.87], [72.91, 18.82], [72.79, 18.76]], {}) });
  map.addLayer({ id: "hindcast-line", type: "line", source: "hindcast", paint: { "line-color": "#17324D", "line-width": 3, "line-dasharray": [2, 1] } });

  map.addSource("forecast", { type: "geojson", data: featurePolygon(operationalForecast.contours[2].polygon as GeoJSON.Polygon) });
  map.addLayer({ id: "forecast-fill", type: "fill", source: "forecast", paint: { "fill-color": "#5E4A1F", "fill-opacity": 0.2 } });
  map.addLayer({ id: "forecast-line", type: "line", source: "forecast", paint: { "line-color": "#5E4A1F", "line-width": 2.5 } });

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
}

function setLayerVisibility(map: Map, phase: OperationPhase) {
  const visible = new Set(phaseLayers[phase]);
  Object.values(phaseLayers).flat().concat("case-aoi-line").forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible.has(layerId) ? "visible" : "none");
    }
  });
}

function fitPhase(map: Map, phase: OperationPhase) {
  map.fitBounds(INDIA_EEZ_BOUNDS, { padding: phase === "monitoring" || phase === "eez" ? 50 : 70, animate: false });
}

function StageOverlay({ phase }: { phase: OperationPhase }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {(phase === "detection" || phase === "hindcast" || phase === "forecast" || phase === "ais" || phase === "ranking") && (
        <div className={`slick-mask-draw slick-irregular absolute left-[49%] top-[45%] h-24 w-36 border-2 border-neutral-900 bg-neutral-900/30 ${phase === "detection" ? "" : "opacity-70"}`} />
      )}
      {phase === "hindcast" && (
        <>
          <div className="hindcast-slick-path absolute left-[50%] top-[46%] h-28 w-44 border-2" />
          <div className="absolute left-[44%] top-[50%] rounded-sm bg-neutral-0 px-2 py-1 text-caption font-medium text-navy-900 shadow-elevation-1">Probable source: 24 Aug 06:00-25 Aug 18:00</div>
        </>
      )}
      {phase === "forecast" && (
        <>
          <div className="forecast-spread absolute left-[48%] top-[44%] h-28 w-44 border-2" />
          <div className="absolute left-[54%] top-[58%] rounded-sm bg-neutral-0 px-2 py-1 font-mono text-caption text-neutral-900 shadow-elevation-1">Forecast +48h</div>
        </>
      )}
      {(phase === "ais" || phase === "ranking") && <ShipOverlay ranked={phase === "ranking"} />}
    </div>
  );
}

function ShipOverlay({ ranked }: { ranked: boolean }) {
  const ships = [
    { name: "MMSI 419000111", x: "45%", y: "47%", rank: 1, score: 78 },
    { name: "MMSI 419000222", x: "52%", y: "55%", rank: 2, score: 61 },
    { name: "MMSI 419000333", x: "39%", y: "42%", rank: 3, score: 57 },
    { name: "MMSI 419000444", x: "61%", y: "60%", rank: 4, score: 32 },
    { name: "MMSI 419000555", x: "33%", y: "58%", rank: 5, score: 29 }
  ];
  return (
    <>
      {ships.map((ship) => {
        const highlighted = ranked && ship.rank <= 3;
        return (
          <div className="ship-track absolute flex items-center gap-1" style={{ left: ship.x, top: ship.y }} key={ship.name}>
            <span className={`grid h-8 w-8 place-items-center rounded-full border bg-neutral-0 shadow-elevation-1 ${highlighted ? "border-status-error text-status-error" : "border-neutral-300 text-neutral-500"}`}>
              <Ship size={18} strokeWidth={1.7} />
            </span>
            {highlighted && <span className="rounded-sm bg-neutral-0 px-2 py-1 font-mono text-caption text-status-error shadow-elevation-1">#{ship.rank} {ship.score}</span>}
          </div>
        );
      })}
    </>
  );
}

function TimelineStrip({ phase }: { phase: OperationPhase }) {
  const label = phase === "forecast" ? "Forecast: next 48 hours" : phase === "hindcast" ? "Hindcast: release window" : "Scene and attribution timeline";
  return (
    <div className="grid grid-cols-[190px_1fr_150px] items-center gap-4 text-caption">
      <div className="font-mono text-neutral-700">20 Aug - 27 Aug 2026</div>
      <input aria-label={label} className="w-full accent-navy-900" type="range" min={0} max={48} step={6} defaultValue={phase === "forecast" ? 48 : 24} />
      <div className="text-right text-neutral-500">{label}</div>
    </div>
  );
}

function featurePolygon(geometry: GeoJSON.Polygon): GeoJSON.Feature<GeoJSON.Polygon> {
  return { type: "Feature", properties: {}, geometry };
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
