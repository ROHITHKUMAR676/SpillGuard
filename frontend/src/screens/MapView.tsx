import { useEffect, useState } from "react";

import { getCandidates, getCase, getForecast, getLatestSlick, getSourceHypothesis, getVessels } from "../api/cases";
import { ErrorState } from "../components/shared/ErrorState";
import { MapCanvas } from "../map/MapCanvas";
import type { AISPosition, AttributionCandidate } from "../types/attribution";
import type { Case } from "../types/case";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";
import type { OilSlick } from "../types/slick";

export function MapView({ caseId }: { caseId: string }) {
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);
  const [slick, setSlick] = useState<OilSlick | null>(null);
  const [source, setSource] = useState<SourceHypothesis | null>(null);
  const [forecast, setForecast] = useState<ForwardForecast | null>(null);
  const [candidates, setCandidates] = useState<AttributionCandidate[]>([]);
  const [positions, setPositions] = useState<AISPosition[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const currentCase = await getCase(caseId);
        if (cancelled) return;
        setCaseRecord(currentCase);
        const bbox = bboxFromPolygon(currentCase.aoi);
        const [latestSlick, latestSource, latestForecast, rankedCandidates, vesselPositions] = await Promise.all([
          getLatestSlick(caseId).catch(() => null),
          getSourceHypothesis(caseId).catch(() => null),
          getForecast(caseId).catch(() => null),
          getCandidates(caseId).catch(() => []),
          getVessels(bbox, currentCase.time_window_start, currentCase.time_window_end).catch(() => [])
        ]);
        if (cancelled) return;
        setSlick(latestSlick);
        setSource(latestSource);
        setForecast(latestForecast);
        setCandidates(rankedCandidates);
        setPositions(vesselPositions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load map data.");
      }
    }
    load();
    const interval = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [caseId]);

  if (error) {
    return <div className="p-6"><ErrorState message={error} /></div>;
  }

  return (
    <MapCanvas
      caseAoi={caseRecord?.aoi as GeoJSON.Polygon | undefined}
      liveSlick={slick ?? undefined}
      liveSource={source ?? undefined}
      liveForecast={forecast ?? undefined}
      liveCandidates={candidates}
      livePositions={positions}
      phase="ranking"
    />
  );
}

function bboxFromPolygon(polygon: GeoJSON.Polygon) {
  const points = polygon.coordinates.flat();
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return `${Math.min(...lons)},${Math.min(...lats)},${Math.max(...lons)},${Math.max(...lats)}`;
}
