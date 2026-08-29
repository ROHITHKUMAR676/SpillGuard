import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCase, listCases, triggerDetect } from "./api/cases";
import { login } from "./api/auth";
import { TestMap } from "./map/TestMap";
import { useAuthStore } from "./store/auth";

const demoAoi = {
  type: "Polygon" as const,
  coordinates: [[[72.6, 18.5], [73.5, 18.5], [73.5, 19.3], [72.6, 19.3], [72.6, 18.5]]]
};

export default function App() {
  const queryClient = useQueryClient();
  const { token, setToken } = useAuthStore();
  const cases = useQuery({ queryKey: ["cases"], queryFn: listCases });
  const loginMutation = useMutation({
    mutationFn: () => login("analyst1", "changeme"),
    onSuccess: (data) => setToken(data.access_token)
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createCase({
        title: "Arabian Sea AOI-1",
        aoi: demoAoi,
        time_window_start: "2026-08-20T00:00:00Z",
        time_window_end: "2026-08-27T00:00:00Z"
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cases"] })
  });
  const detectMutation = useMutation({ mutationFn: triggerDetect });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[380px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-5">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Synthetic AIS visible in this build</p>
            <h1 className="mt-1 text-2xl font-semibold">PS26143 SpillGuard</h1>
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white" onClick={() => loginMutation.mutate()}>
              {token ? "Token Ready" : "Login Demo"}
            </button>
            <button className="rounded border border-slate-300 px-3 py-2 text-sm font-medium" onClick={() => createMutation.mutate()} disabled={!token}>
              Create Case
            </button>
          </div>
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700">Cases</h2>
            <div className="mt-3 space-y-2">
              {cases.data?.map((item) => (
                <div className="rounded border border-slate-200 p-3" key={item.id}>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.status}</div>
                  <button className="mt-3 rounded bg-teal-700 px-3 py-2 text-xs font-medium text-white" onClick={() => detectMutation.mutate(item.id)} disabled={!token}>
                    Trigger Detect
                  </button>
                </div>
              ))}
              {cases.data?.length === 0 && <p className="text-sm text-slate-500">No cases yet.</p>}
            </div>
          </section>
          {detectMutation.data && <p className="mt-4 text-sm text-slate-600">Queued job {detectMutation.data.id}</p>}
        </aside>
        <section className="min-h-[520px]">
          <TestMap />
        </section>
      </div>
    </main>
  );
}
