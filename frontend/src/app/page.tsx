import Hero from '@/components/home/Hero';
import ModesChapter from '@/components/home/modes/ModesChapter';
import ResumeChapter from '@/components/home/resume/ResumeChapter';
import FeedbackChapter from '@/components/home/feedback/FeedbackChapter';
import AdvantagesChapter from '@/components/home/advantages/AdvantagesChapter';
import Testimonials from '@/components/home/Testimonials';
import FaqCta from '@/components/home/FaqCta';

// 服务端组件：只有需要交互或动画的部分是客户端组件
export default function Home() {
  return (
    <>
      <Hero />
      <ModesChapter />
      <ResumeChapter />
      <FeedbackChapter />
      <AdvantagesChapter />
      <Testimonials />
      <FaqCta />
    </>
  );
}
