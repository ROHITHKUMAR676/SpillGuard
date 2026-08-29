import { demoCase } from "../data/demo";
import { MapCanvas } from "../map/MapCanvas";

export function MapView() {
  return <MapCanvas caseAoi={demoCase.aoi as GeoJSON.Polygon} />;
}
