'use client';

import InterviewRoom from '@/components/interview/room/InterviewRoom';
import type { InterviewRoomConfig } from '@/components/interview/room/InterviewRoom';

const sanitize = (s: string) => s.replace(/[<>&"'`]/g, '');

const config: InterviewRoomConfig = {
  kind: 'social',
  title: '社招简历面试',
  subtitle: (p) =>
    [p?.position_name, p?.company_name].filter(Boolean).join(' · ') || '围绕简历的综合面试',
  speechType: 'comprehensive',
  buildRequest: (params) => {
    if (!params || !params.resume_id) {
      return { error: '缺少面试参数或简历，请从配置页重新进入' };
    }
    return {
      body: {
        type: String(params.type || 'comprehensive'),
        domain: String(params.domain || 'experienced'),
        difficulty: String(params.difficulty || 'simple'),
        position_name: String(params.position_name || ''),
        company_name: sanitize(String(params.company_name || '')),
        resume_id: Number(params.resume_id),
      },
    };
  },
  preparingText: '正在分析简历并生成第一道题…',
};

export default function SocialInterviewStartPage() {
  return <InterviewRoom config={config} />;
}
