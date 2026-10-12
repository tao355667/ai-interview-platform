import { statusMeta } from './recordMeta';

export default function StatusTag({ status }: { status?: string | null }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.text}
    </span>
  );
}
