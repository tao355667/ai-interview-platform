import Hero from '@/components/home/Hero';
import ModeBento from '@/components/home/ModeBento';
import ResumePipeline from '@/components/home/ResumePipeline';
import CapabilityBento from '@/components/home/CapabilityBento';
import StatsBand from '@/components/home/StatsBand';
import Testimonials from '@/components/home/Testimonials';
import FaqCta from '@/components/home/FaqCta';

// 服务端组件：只有需要交互或动画的部分是客户端组件
export default function Home() {
  return (
    <>
      <Hero />
      <ModeBento />
      <ResumePipeline />
      <CapabilityBento />
      <StatsBand />
      <Testimonials />
      <FaqCta />
    </>
  );
}
