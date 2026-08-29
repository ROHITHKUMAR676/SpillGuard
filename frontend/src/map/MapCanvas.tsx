import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";
import maplibregl, { Map } from "maplibre-gl";

import { DataSourceModeBadge } from "../components/shared/DataSourceModeBadge";
import { SyntheticFlag } from "../components/shared/SyntheticFlag";
import { demoCandidates, demoForecast, demoSlick, demoSource } from "../data/demo";
import { INDIA_EEZ_BOUNDS } from "./layers/base";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";

export function MapCanvas({ caseAoi, embedded = false }: { caseAoi?: GeoJSON.Polygon; embedded?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [78, 15],
      zoom: 4
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      if (caseAoi) {
        const coords = caseAoi.coordinates[0];
        const bounds = coords.reduce((b, coord) => b.extend(coord as [number, number]), new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]));
        map.fitBounds(bounds, { padding: 80, animate: false });
      } else {
        map.fitBounds(INDIA_EEZ_BOUNDS, { padding: 40, animate: false });
      }
      addLayers(map, caseAoi);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [caseAoi]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-neutral-100 ${embedded ? "min-h-full" : "min-h-[calc(100vh-104px)]"}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {!embedded && (
        <>
          <MapControls />
          <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2 rounded-md border border-neutral-200 bg-neutral-0 p-3 shadow-elevation-1">
            <span className="rounded-full bg-navy-900"><DataSourceModeBadge /></span>
            <SyntheticFlag compact />
          </div>
          <MapLegend />
          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-neutral-0/95 px-6 py-3">
            <TimelineStrip />
          </div>
        </>
      )}
    </div>
  );
}

function addLayers(map: Map, caseAoi?: GeoJSON.Polygon) {
  map.addSource("case-aoi", { type: "geojson", data: { type: "Feature", properties: {}, geometry: caseAoi ?? demoSource.probable_source_region } });
  map.addLayer({ id: "case-aoi-line", type: "line", source: "case-aoi", paint: { "line-color": "#1D4E89", "line-width": 2, "line-dasharray": [2, 2] } });
  map.addSource("slicks", { type: "geojson", data: { type: "Feature", properties: { confidence: demoSlick.confidence }, geometry: demoSlick.geometry as GeoJSON.MultiPolygon } });
  map.addLayer({ id: "slick-fill", type: "fill", source: "slicks", paint: { "fill-color": "#3A3A3A", "fill-opacity": 0.62 } });
  map.addLayer({ id: "slick-line", type: "line", source: "slicks", paint: { "line-color": "#3A3A3A", "line-width": 2 } });
  map.addSource("source-region", { type: "geojson", data: { type: "Feature", properties: {}, geometry: demoSource.probable_source_region as GeoJSON.Polygon } });
  map.addLayer({ id: "source-fill", type: "fill", source: "source-region", paint: { "fill-color": "#1D4E89", "fill-opacity": 0.22 } });
  map.addLayer({ id: "source-line", type: "line", source: "source-region", paint: { "line-color": "#0B2545", "line-width": 2 } });
  map.addSource("forecast", { type: "geojson", data: { type: "Feature", properties: {}, geometry: demoForecast.contours[2].polygon as GeoJSON.Polygon } });
  map.addLayer({ id: "forecast-fill", type: "fill", source: "forecast", paint: { "fill-color": "#B5860B", "fill-opacity": 0.18 } });
  map.addLayer({ id: "forecast-line", type: "line", source: "forecast", paint: { "line-color": "#B5860B", "line-width": 2 } });
  map.addSource("vessels", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: demoCandidates.map((candidate, index) => ({
        type: "Feature",
        properties: { rank: candidate.rank },
        geometry: { type: "Point", coordinates: index === 0 ? [73.0, 18.9] : [72.8, 18.75] }
      }))
    }
  });
  map.addLayer({
    id: "vessel-markers",
    type: "circle",
    source: "vessels",
    paint: {
      "circle-color": ["case", ["==", ["get", "rank"], 1], "#B3261E", "#B5860B"],
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#FFFFFF"
    }
  });
}

function TimelineStrip() {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-4 text-caption">
      <div className="font-mono text-neutral-700">20 Aug - 27 Aug 2026</div>
      <input aria-label="Forecast timeline scrubber" className="w-full accent-navy-900" type="range" min={12} max={72} step={12} defaultValue={48} />
    </div>
  );
}
