import type { ReactNode } from 'react';
import { createElement } from 'react';
import { Briefcase, Code2, GraduationCap, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 图标按 1em 缩放，和文字大小保持一致（与原 antd 图标的用法相同） */
const icon = (Icon: LucideIcon) =>
  createElement(Icon, { className: 'h-[1em] w-[1em]', strokeWidth: 1.75, 'aria-hidden': true });

export type InterviewKind = 'social' | 'campus' | 'special' | 'multi';

export interface InterviewTypeMeta {
  kind: InterviewKind;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
  icon: ReactNode;
  /** 图标底色 + 图标颜色，只用于图标和小标签，页面主体统一用主色 */
  toneClass: string;
}

export const INTERVIEW_TYPES: Record<InterviewKind, InterviewTypeMeta> = {
  social: {
    kind: 'social',
    label: '社招简历面试',
    shortLabel: '社招',
    description: '面向有工作经验的候选人，围绕简历项目深挖',
    href: '/interview/social',
    icon: icon(Briefcase),
    toneClass: 'bg-brand-50 text-brand-700',
  },
  campus: {
    kind: 'campus',
    label: '校招简历面试',
    shortLabel: '校招',
    description: '面向应届生，侧重基础知识与项目经历',
    href: '/interview/campus',
    icon: icon(GraduationCap),
    toneClass: 'bg-accent-50 text-accent-600',
  },
  special: {
    kind: 'special',
    label: '专项面试',
    shortLabel: '专项',
    description: '针对单一技术栈集中练习，快速补齐短板',
    href: '/interview/special',
    icon: icon(Code2),
    toneClass: 'bg-violet-50 text-violet-600',
  },
  multi: {
    kind: 'multi',
    label: '多人面试',
    shortLabel: '多人',
    description: '主面试官、技术面试官、项目面试官组成面试小组',
    href: '/interview/multi',
    icon: icon(Users),
    toneClass: 'bg-warning-soft text-warning',
  },
};

export const INTERVIEW_TYPE_LIST: InterviewTypeMeta[] = [
  INTERVIEW_TYPES.social,
  INTERVIEW_TYPES.campus,
  INTERVIEW_TYPES.special,
  INTERVIEW_TYPES.multi,
];
