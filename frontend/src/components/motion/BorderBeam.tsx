'use client';

// 移植自 Magic UI Border Beam（MIT License, Copyright (c) Magic UI），Tailwind v4 写法改为内联样式
// https://magicui.design/docs/components/border-beam
import type { CSSProperties } from 'react';
import * as m from 'motion/react-m';

interface BorderBeamProps {
  /** 光点长度（px） */
  size?: number;
  /** 绕一圈的时长（秒） */
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}

/** 沿容器边框缓慢流动的一段光；容器需要 position: relative 和圆角 */
export function BorderBeam({
  size = 160,
  duration = 10,
  colorFrom = '#10BB83',
  colorTo = '#A7F3D0',
  borderWidth = 1,
}: BorderBeamProps) {
  const maskStyle: CSSProperties = {
    // 用 padding 留出边框宽度，再用遮罩挖掉内容区，只剩一圈边框可见
    padding: borderWidth,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    maskComposite: 'exclude',
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={maskStyle}
    >
      <m.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={{ repeat: Infinity, ease: 'linear', duration }}
      />
    </div>
  );
}
