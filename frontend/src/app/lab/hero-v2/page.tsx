import type { Metadata } from 'next';
import ThreadHero from '@/components/lab/thread-v2/ThreadHero';

// 首屏艺术方向原型，独立于线上首页，不进搜索引擎
export const metadata: Metadata = {
  title: '首屏原型 · 线索 v2 - 面策',
  robots: { index: false, follow: false },
};

export default function HeroLabV2Page() {
  return <ThreadHero />;
}
