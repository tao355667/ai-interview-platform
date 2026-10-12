// This route is intentionally returning a 404 (notFound) at the server level
// to immediately make the page inaccessible without deleting your original
// client implementation. The original client component is preserved below
// and commented out per your request.

import { notFound } from 'next/navigation';

// Server component that always returns 404
export default function Page() {
  // Calling notFound() will cause Next.js to render the 404 page (status 404)
  notFound();
  return null;
}

/*
// Original client component preserved (commented out). Do not delete — kept
// here so you can restore it later if needed. It was a client component using
// React hooks and Ant Design UI.
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/common/PageHeader';

const staticData = {
  questions: [
    {
      title: '我看你简历上提到了RAG驱动AI旅行助手项目，你主要负责的部分吗？',
      question:
        '我看你简历上提到了RAG驱动AI旅行助手项目，能先跟我简单介绍一下这个项目的背景和你主要负责的部分吗？',
      idea: [
        {
          label: '背景',
          value: '项目背景兼顾的真实性、个人职责的清晰度、技术方案的合理性、项目成果的可信度',
        },
        { label: '职责', value: '负责AI助手的研发落地，提升游客户体验和员工效率' },
        { label: '挑战', value: '解决数据检索和知识问答的准确性问题，构建可解释的AI响应' },
        { label: '成果', value: '整体满意度提升，业务指标优化，成功率提升' },
      ],
      reference:
        '该项目为RAG驱动的旅行助手，整合检索与生成，在稳定性与响应速度上做了优化，通过流式SSE提升交互体验，线下部署容器化，核心链路可用性达到99%以上。',
      followups: [
        '这个AI助手为何选择RAG而不是单纯生成式模型驱动？',
        '你在项目中的技术决策有哪些？如何权衡准确性与性能？',
        '项目上线后，用户反馈和指标变化如何？下一步的优化方向？',
      ],
    },
    {
      title: '在这个AI旅行助手中如何做多源数据检索与融合？',
      question: '在这个AI旅行助手中，如何实现多源数据检索与融合以保证答复的可靠性？',
      idea: [
        { label: '背景', value: '多源数据，包括百科、攻略库、商家信息与用户生成内容' },
        { label: '职责', value: '负责检索管道设计与结果融合策略落地' },
        { label: '挑战', value: '异构数据的质量与时效性问题' },
        { label: '成果', value: '答复准确率与一致性提升' },
      ],
      reference:
        '采用分层检索与重排策略，BM25+向量检索结合，针对问句类别使用不同的融合权重与投票机制。',
      followups: ['你如何评估融合策略的效果？', '数据时效性问题如何处理？'],
    },
    {
      title: '在RAG系统中如何处理并发与延迟问题？',
      question: '在RAG系统中如何处理并发与延迟问题，确保用户体验？',
      idea: [
        { label: '背景', value: '高并发场景下检索与生成的协同' },
        { label: '职责', value: '优化请求调度与缓存策略' },
        { label: '挑战', value: '检索延迟与生成阻塞' },
        { label: '成果', value: '端到端延迟稳定在 100-200ms 量级（流式首包更快）' },
      ],
      reference:
        '采用异步管道与消息队列配合，本地向量缓存与热点文档预取，首包用SSE推送提升感知速度。',
      followups: ['为什么选择SSE而非WebSocket？', '缓存失效策略如何设计？'],
    },
  ],
};

export default function InterviewDetailPage() {
  const [selected, setSelected] = useState(0);
  const current = useMemo(
    () => staticData.questions[selected] || staticData.questions[0],
    [selected]
  );

  return (
    <div className="page py-10">
      <PageHeader
        title="押题详情"
        description="查看答案思路、参考答案与可能的追问"
        extra={
          <Link href="/user/interviews" className="text-ink-secondary hover:text-brand-800">
            返回面试记录
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <nav className="surface self-start overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-medium text-ink">目录</div>
          <ol>
            {staticData.questions.map((item, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setSelected(index)}
                  className={`w-full px-4 py-3 text-left text-sm transition-colors duration-150 ${
                    index === selected
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {index + 1}. {item.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="surface space-y-6 p-5 sm:p-6">
          <h2 className="max-w-3xl text-lg font-semibold leading-7 text-ink">{current.question}</h2>

          <section>
            <h3 className="mb-3 text-base font-semibold text-ink">答案思路</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {current.idea.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-line bg-canvas p-4">
                  <div className="mb-1 text-sm font-medium text-brand-800">{it.label}</div>
                  <p className="text-[15px] leading-7 text-ink">{it.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold text-ink">参考答案</h3>
            <p className="max-w-3xl text-[15px] leading-7 text-ink">{current.reference}</p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold text-ink">可能追问</h3>
            <ul className="max-w-3xl list-disc space-y-1 pl-5 text-[15px] leading-7 text-ink">
              {current.followups.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
}
*/
