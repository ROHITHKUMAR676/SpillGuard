export interface GeoJSONPolygon { type: "Polygon"; coordinates: number[][][]; }
export interface GeoJSONMultiPolygon { type: "MultiPolygon"; coordinates: number[][][][]; }
export interface GeoJSONPoint { type: "Point"; coordinates: [number, number]; }
