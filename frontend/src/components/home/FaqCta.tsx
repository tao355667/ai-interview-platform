import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import SectionHeading, { phrases } from './SectionHeading';

const FAQ = [
  {
    q: '和直接用通用 AI 聊天工具练面试有什么区别？',
    a: '面试吧针对面试场景做了定制：有完整的面试流程、会根据回答追问，并且有统一的评估维度和报告，更接近真实面试官的要求。',
  },
  {
    q: '需要先上传简历吗？',
    a: '社招、校招和多人面试会围绕简历出题，需要先在个人中心上传 PDF 简历；专项面试只需选择技术栈，不需要简历。',
  },
  {
    q: '一场面试大概多久？',
    a: '每场 5–10 道题，一般 30 分钟左右。中途可以随时结束，系统会根据已作答的题目生成报告。',
  },
  {
    q: '支持语音作答吗？',
    a: '支持。面试中点击麦克风录音，识别结果会自动填入输入框，你可以修改后再发送。',
  },
];

export default function FaqCta() {
  return (
    <>
      <section className="page grid gap-12 py-24 lg:grid-cols-[minmax(0,360px)_1fr]">
        <SectionHeading
          eyebrow="常见问题"
          title="开始之前"
          description="还有其他问题，可以查看使用手册。"
        />
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-medium text-ink">
                {f.q}
                <Plus
                  className="h-4 w-4 shrink-0 text-ink-secondary transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-secondary">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="page pb-24">
        <div className="relative overflow-hidden rounded-[28px] border border-line bg-white px-6 py-16 text-center shadow-card sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(191,234,46,0.35),transparent)]"
          />
          <h2 className="relative text-balance text-title text-ink">
            {phrases('下一场面试之前，先在这里练一次')}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base leading-7 text-ink-secondary">
            选一种面试模式，十分钟后你就会知道自己最该补哪一块。
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/interview/social" className="link-btn-primary link-btn-lg">
              开始模拟面试
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/resume" className="link-btn-default link-btn-lg">
              用简历押题
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
