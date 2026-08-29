import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";
import maplibregl, { Map } from "maplibre-gl";

const polygon = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [[[72.72, 18.68], [73.28, 18.68], [73.28, 19.12], [72.72, 19.12], [72.72, 18.68]]]
  }
};

export function TestMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [73.0, 18.9],
      zoom: 8
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("source-region", { type: "geojson", data: polygon });
      map.addLayer({
        id: "source-region-fill",
        type: "fill",
        source: "source-region",
        paint: { "fill-color": "#14b8a6", "fill-opacity": 0.28 }
      });
      map.addLayer({
        id: "source-region-outline",
        type: "line",
        source: "source-region",
        paint: { "line-color": "#0f766e", "line-width": 2 }
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full min-h-[420px] w-full" />;
}
