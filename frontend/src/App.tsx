import { useEffect, useState } from "react";

import { TopBar } from "./components/layout/TopBar";
import { AuditLog } from "./screens/AuditLog";
import { CaseDetailShell } from "./screens/CaseDetailShell";
import { CaseIntake } from "./screens/CaseIntake";
import { CaseList } from "./screens/CaseList";
import { EvidenceExplorer } from "./screens/EvidenceExplorer";
import { Login } from "./screens/Login";
import { MapView } from "./screens/MapView";
import { OperationalConsole } from "./screens/OperationalConsole";
import { Reports } from "./screens/Reports";
import { SourcePanel } from "./screens/SourcePanel";
import { SpillPanel } from "./screens/SpillPanel";
import { Timeline } from "./screens/Timeline";
import { VesselRanking } from "./screens/VesselRanking";

const caseId = "ARB-2026-014";

export default function App() {
  const [route, setRoute] = useState(window.location.pathname === "/" ? "/operations" : window.location.pathname);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(path);
  }

  useEffect(() => {
    const listener = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  if (route === "/login") return <><div className="desktop-guard">This console is optimized for larger screens. Please use a desktop or laptop display.</div><div className="desktop-app"><Login navigate={navigate} /></div></>;

  const content = route === "/operations" ? <OperationalConsole /> : route === "/cases/new" ? <CaseIntake navigate={navigate} /> : route.includes("/timeline") ? <Timeline /> : route.includes("/spill") ? <SpillPanel /> : route.includes("/source") ? <SourcePanel /> : route.includes("/vessels/ves-") ? <EvidenceExplorer /> : route.includes("/vessels") ? <VesselRanking navigate={navigate} /> : route.includes("/reports") ? <Reports /> : route.includes("/audit") ? <AuditLog /> : route.includes("/cases/") ? <MapView /> : route === "/dashboard" ? <CaseList navigate={navigate} /> : <OperationalConsole />;

  const inCase = route.includes("/cases/") && route !== "/cases/new";
  return (
    <>
      <div className="desktop-guard">This console is optimized for larger screens. Please use a desktop or laptop display.</div>
      <div className="desktop-app min-h-screen bg-neutral-50 pt-14">
        <TopBar route={route} navigate={navigate} />
        {inCase ? <CaseDetailShell route={route} navigate={navigate} caseId={caseId}>{content}</CaseDetailShell> : content}
      </div>
    </>
  );
}
