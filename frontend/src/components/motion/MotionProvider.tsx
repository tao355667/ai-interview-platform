'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 全局动画配置：
 * - LazyMotion + m 组件只加载基础动画特性，减小打包体积（strict：误用 motion.* 会直接报错）
 * - reducedMotion="user"：系统开启“减弱动态效果”时自动关闭位移类动画，只保留透明度变化
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
