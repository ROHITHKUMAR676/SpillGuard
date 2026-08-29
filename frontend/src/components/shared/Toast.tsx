export function Toast({ message }: { message: string }) {
  return <div className="fixed bottom-4 right-4 rounded-md border border-neutral-200 bg-neutral-0 px-4 py-3 text-body shadow-elevation-1">{message}</div>;
}
