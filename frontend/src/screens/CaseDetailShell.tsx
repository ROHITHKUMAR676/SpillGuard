import { SubHeader } from "../components/layout/SubHeader";

export function CaseDetailShell({ children, route, navigate, caseId }: { children: React.ReactNode; route: string; navigate: (path: string) => void; caseId: string }) {
  return (
    <>
      <SubHeader route={route} navigate={navigate} caseId={caseId} />
      <div className="pt-12">{children}</div>
    </>
  );
}
