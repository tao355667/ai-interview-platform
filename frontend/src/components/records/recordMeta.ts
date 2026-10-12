import { INTERVIEW_TYPES, type InterviewTypeMeta } from '@/config/interviewTypes';

/** 根据后端记录的 type / domain 推断面试类型（社招、校招、专项、多人） */
export function resolveInterviewType(
  type?: string | null,
  domain?: string | null
): InterviewTypeMeta | null {
  const t = (type || '').toLowerCase();
  const d = (domain || '').toLowerCase();
  if (t.includes('multi')) return INTERVIEW_TYPES.multi;
  if (t.includes('special') || t.includes('专项')) return INTERVIEW_TYPES.special;
  if (d === 'experienced' || d === '社招') return INTERVIEW_TYPES.social;
  if (d === 'campus' || d === '校招') return INTERVIEW_TYPES.campus;
  return null;
}

const RAW_TYPE_LABELS: Record<string, string> = {
  comprehensive: '综合面试',
  technical: '技术面',
  hr: 'HR 面',
  behavioral: '行为面',
};

/** 无法归入四种面试类型时的类型文案 */
export function rawTypeLabel(type?: string | null): string {
  if (!type) return '未知类型';
  return RAW_TYPE_LABELS[type.toLowerCase()] || type;
}

const DOMAIN_LABELS: Record<string, string> = {
  experienced: '社招',
  campus: '校招',
  eino: 'Eino',
};

export function domainLabel(domain?: string | null): string {
  if (!domain) return '';
  return DOMAIN_LABELS[domain.toLowerCase()] || domain;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export function difficultyLabel(difficulty?: string | null): string {
  if (!difficulty) return '';
  return DIFFICULTY_LABELS[difficulty.toLowerCase()] || difficulty;
}

export interface StatusMeta {
  text: string;
  className: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  pending: { text: '待开始', className: 'bg-brand-50 text-brand-800' },
  in_progress: { text: '进行中', className: 'bg-warning-soft text-warning' },
  completed: { text: '已完成', className: 'bg-success-soft text-success' },
  aborted: { text: '已中断', className: 'bg-canvas text-ink-secondary' },
  failed: { text: '异常退出', className: 'bg-danger-soft text-danger' },
};

export function statusMeta(status?: string | null): StatusMeta {
  return (
    (status && STATUS_META[status]) || {
      text: status || '未知',
      className: 'bg-canvas text-ink-secondary',
    }
  );
}

export type ScoreLevel = 'success' | 'warning' | 'danger';

/** 分数分档：≥80 良好，60–79 一般，<60 待提升 */
export function scoreLevel(score: number): ScoreLevel {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export const SCORE_TEXT_CLASS: Record<ScoreLevel, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export const SCORE_LEVEL_LABEL: Record<ScoreLevel, string> = {
  success: '表现良好',
  warning: '基本达标',
  danger: '有待提升',
};

export function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(totalSeconds?: number | null): string {
  if (!totalSeconds && totalSeconds !== 0) return '';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}
