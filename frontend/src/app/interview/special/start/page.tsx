'use client';

import InterviewRoom from '@/components/interview/room/InterviewRoom';
import type { InterviewRoomConfig } from '@/components/interview/room/InterviewRoom';

const config: InterviewRoomConfig = {
  kind: 'special',
  title: '专项面试',
  subtitle: (p) => p?.domain || '技术专项练习',
  speechType: 'special',
  speechDomain: (p) => p.domain || '',
  buildRequest: (params) => {
    if (!params) return { error: '缺少面试参数，请从配置页重新进入' };
    return {
      body: {
        type: 'special',
        domain: String(params.domain || ''),
        difficulty: String(params.difficulty || ''),
      },
    };
  },
  preparingText: '正在准备专项面试题…',
};

export default function SpecialInterviewStartPage() {
  return <InterviewRoom config={config} />;
}
