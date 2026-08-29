import { operationalCase } from "../data/operational";
import { MapCanvas } from "../map/MapCanvas";

export function MapView() {
  return <MapCanvas caseAoi={operationalCase.aoi as GeoJSON.Polygon} />;
}
