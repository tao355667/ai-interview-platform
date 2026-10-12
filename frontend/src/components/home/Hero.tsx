import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import InterviewConsole from './InterviewConsole';

/** 首屏：居中大标题 + 下方铺满的实时面试台。入场动画用纯 CSS，依次错峰出现 */
export default function Hero() {
  const rise = (delay: number) => ({ animationDelay: `${delay}ms` });

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[640px]"
      />
      <div className="page relative pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <p
            className="inline-flex animate-rise items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink-secondary shadow-xs"
            style={rise(0)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
            AI 模拟面试 · 读过你简历的面试官
          </p>
          <h1 className="mt-7 animate-rise text-balance text-display text-ink" style={rise(80)}>
            答完这一题，
            <br />
            面试官还会<span className="text-brand-700">追问</span>。
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl animate-rise text-balance text-[17px] leading-8 text-ink-secondary"
            style={rise(160)}
          >
            面试吧把技术面试搬到线上：AI
            面试官围绕你的简历提问，顺着你的回答继续深挖，结束后逐题告诉你哪里答得好、哪里还差一点。
          </p>
          <div
            className="mt-9 flex animate-rise flex-wrap items-center justify-center gap-3"
            style={rise(240)}
          >
            <Link href="/interview/social" className="link-btn-primary link-btn-lg">
              开始模拟面试
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/resume" className="link-btn-default link-btn-lg">
              用简历押题
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl animate-rise sm:mt-20" style={rise(360)}>
          {/* 面试台背后的一团柔光 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-16 -top-12 bottom-0 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(16,187,131,0.16),transparent)] blur-2xl"
          />
          <InterviewConsole />
        </div>
      </div>
    </section>
  );
}
