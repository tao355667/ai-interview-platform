import SectionHeading from './SectionHeading';

// 示例数据：评价内容为占位文案，上线前请替换为真实用户反馈
const TESTIMONIALS = [
  {
    text: '非科班出身，基础一直比较薄弱。简历押题押中了真实面试里的大部分问题，也帮我把 Spring IOC 到 AOP 的知识串了起来。',
    user: '35+ 再出发',
    title: '社招 Java 开发',
  },
  {
    text: '996 的节奏没时间约模拟面试，这里随时能练。系统设计和业务逻辑都练到了，终面很多题似曾相识。',
    user: 'smartbob',
    title: 'Go 开发',
  },
  {
    text: '追问环节让我讲清技术细节的能力提升很多，Redis AOF 和优化方案都被一层层问到了。',
    user: 'Lex',
    title: '架构师',
  },
  {
    text: '系统设计一直是短板，报告里的建议帮我理清了思路，现在能把方案讲清楚了。',
    user: '静心',
    title: '后端开发',
  },
  {
    text: '比找人一对一辅导便宜得多，效果差不了太多，很值。',
    user: 'jackey',
    title: '后端开发',
  },
  {
    text: '从 Django ORM 优化到接口设计都被问到了，准备得很全面。',
    user: '莫然',
    title: 'Python 开发',
  },
];

const AVATAR_TONES = [
  'bg-brand-50 text-brand-800',
  'bg-accent-50 text-accent-700',
  'bg-violet-50 text-violet-600',
  'bg-warning-soft text-warning',
];

function Card({ t, i }: { t: (typeof TESTIMONIALS)[number]; i: number }) {
  return (
    <figure className="flex w-[320px] shrink-0 flex-col rounded-tile border border-line bg-white p-6 shadow-card sm:w-[360px]">
      <blockquote className="flex-1 text-[15px] leading-7 text-ink">{t.text}</blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
          aria-hidden="true"
        >
          {t.user.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <span className="block text-sm font-medium text-ink">{t.user}</span>
          <span className="block text-xs text-ink-secondary">{t.title}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** 用户评价：横向缓慢滚动，悬停暂停；减弱动态效果时改为可手动横向滚动 */
export default function Testimonials() {
  return (
    <section id="testimonials" className="scroll-mt-20 py-24">
      <div className="page">
        <SectionHeading eyebrow="用户反馈" title="练过的人怎么说" />
      </div>
      <div className="group relative mt-12 overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
        <ul
          className="flex w-max gap-4 px-4 animate-marquee [--marquee-duration:60s] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          aria-label="用户评价"
        >
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
            <li key={i} aria-hidden={i >= TESTIMONIALS.length ? true : undefined}>
              <Card t={t} i={i} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
