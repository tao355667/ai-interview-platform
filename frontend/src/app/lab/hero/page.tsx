import type { Metadata } from 'next';
import Hero from '@/components/home/Hero';
import ModeBento from '@/components/home/ModeBento';

// 首屏调试页：和首页同一个组件，多一条状态切换的调试条，不进搜索引擎
export const metadata: Metadata = {
  title: '首屏调试 - 面试吧',
  robots: { index: false, follow: false },
};

export default function HeroLabPage() {
  return (
    <>
      <Hero debug />
      <ModeBento />
    </>
  );
}
