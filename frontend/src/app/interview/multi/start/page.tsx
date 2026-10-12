'use client';

import InterviewRoom from '@/components/interview/room/InterviewRoom';
import type { InterviewRoomConfig } from '@/components/interview/room/InterviewRoom';

const config: InterviewRoomConfig = {
  kind: 'multi',
  title: '多人面试',
  subtitle: () => '主面试官 · 技术面试官 · 项目面试官',
  speechType: 'multi-agent',
  multiAgent: true,
  buildRequest: (params) => {
    if (!params) return { error: '缺少面试参数，请重新配置', redirectTo: '/interview/multi' };
    return {
      body: {
        type: params.type,
        domain: params.domain,
        difficulty: params.difficulty,
        position_name: params.position_name,
        company_name: params.company_name,
        resume_id: params.resume_id,
      },
    };
  },
  preparingText: '面试小组正在入场…',
};

export default function MultiAgentInterviewStartPage() {
  return <InterviewRoom config={config} />;
}
