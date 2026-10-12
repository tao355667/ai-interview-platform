import { resolveInterviewType, rawTypeLabel } from './recordMeta';

interface InterviewTypeTagProps {
  type?: string | null;
  domain?: string | null;
  /** 使用完整名称（如“社招简历面试”），默认使用简称 */
  full?: boolean;
}

/** 面试类型小标签：颜色取自 interviewTypes.ts 的 toneClass */
export default function InterviewTypeTag({ type, domain, full }: InterviewTypeTagProps) {
  const meta = resolveInterviewType(type, domain);
  const label = meta ? (full ? meta.label : meta.shortLabel) : rawTypeLabel(type);
  const tone = meta ? meta.toneClass : 'bg-canvas text-ink-secondary';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {meta?.icon}
      {label}
    </span>
  );
}
