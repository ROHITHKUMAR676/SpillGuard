import type { ReactNode } from "react";

export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-neutral-0">
      <table className="w-full border-collapse text-left text-body">
        <thead className="sticky top-0 bg-neutral-0 text-h3 text-neutral-900">
          <tr>{headers.map((header) => <th className="border-b border-neutral-200 px-4 py-3" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody className="[&_tr:nth-child(even)]:bg-neutral-50 [&_tr:hover]:bg-navy-50">{children}</tbody>
      </table>
    </div>
  );
}
