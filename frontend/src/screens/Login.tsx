import { Anchor } from "lucide-react";

import { Button } from "../components/shared/Button";

export function Login({ navigate }: { navigate: (path: string) => void }) {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="h-2 bg-navy-900" />
      <div className="grid min-h-[calc(100vh-8px)] place-items-center p-6">
        <section className="w-[400px] rounded-md border border-neutral-200 bg-neutral-0 p-6 shadow-elevation-1">
          <div className="flex items-center gap-3 text-navy-900">
            <Anchor size={24} strokeWidth={1.5} />
            <span className="text-h3">SPILLGUARD</span>
          </div>
          <h1 className="mt-6 text-h2">Sign in to continue</h1>
          <label className="mt-5 block text-body-medium">Username<input className="mt-1 h-9 w-full rounded-sm border border-neutral-300 bg-neutral-0 px-3 text-body" defaultValue="analyst1" /></label>
          <label className="mt-4 block text-body-medium">Password<input className="mt-1 h-9 w-full rounded-sm border border-neutral-300 bg-neutral-0 px-3 text-body" defaultValue="changeme" type="password" /></label>
          <Button className="mt-6 w-full" onClick={() => navigate("/dashboard")}>Sign in</Button>
          <p className="mt-4 text-caption text-neutral-500">For authorized personnel only. All access is logged.</p>
        </section>
      </div>
    </main>
  );
}
