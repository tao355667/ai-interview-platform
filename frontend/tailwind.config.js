/** @type {import('tailwindcss').Config} */
// 设计令牌：颜色值与 src/theme/tokens.ts 保持一致（antd 主题同样读取 tokens.ts）
module.exports = {
  // 工具类加上 body 前缀提高优先级，确保写在 antd 组件上的 Tailwind 类能覆盖 antd 默认样式
  important: 'body',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/config/**/*.{js,ts,jsx,tsx}',
    './src/types/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 主色：荧光黄绿。只用作填充（按钮、进度、高亮笔刷），上面的文字用墨黑
        // 浅底上的文字、链接、图标一律用 800（深橄榄），600 直接做文字对比度只有约 1.4:1
        brand: {
          50: '#F7FDE7',
          100: '#EEFAC6',
          200: '#DDF59A',
          300: '#CDEF6C',
          400: '#C4EC4A',
          500: '#CFF25A',
          600: '#BFEA2E',
          700: '#9CC41A',
          800: '#4D6A06',
          900: '#36490A',
        },
        // 森林墨绿：全站唯一的深色区块，荧光黄绿在上面最醒目
        forest: {
          DEFAULT: '#0F1F17',
          800: '#15291F',
          700: '#1C3628',
          600: '#264634',
        },
        // 浅荧光：深色区块上的强调文字和局部光晕
        mint: '#D9F58A',
        // 辅助蓝：信息提示、次要区分
        accent: {
          50: '#E8F2FD',
          100: '#D3E5FB',
          200: '#A9CBF5',
          500: '#1476E4',
          600: '#1266D0',
          700: '#0F55AD',
        },
        // 辅助紫：仅用于图标和小标签的类型区分
        violet: {
          50: '#F0EDFB',
          200: '#CFC6F1',
          600: '#6550C4',
        },
        // 中性色：文字、边框、底色（带一点绿调）
        ink: {
          DEFAULT: '#0E1A15',
          secondary: '#56635D',
          muted: '#8A958F',
        },
        line: {
          DEFAULT: '#E4E8E6',
          strong: '#CDD4D0',
        },
        canvas: '#F7F8F7',
        // 语义色：成功仍用绿色，和品牌色分开，保证状态含义清楚
        success: { DEFAULT: '#0B7F59', soft: '#E8F8F1' },
        warning: { DEFAULT: '#B7791F', soft: '#FBF3E3' },
        danger: { DEFAULT: '#D14343', soft: '#FCECEC' },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        // 首屏大标题，随屏宽在 40px–76px 之间缩放
        display: [
          'clamp(2.5rem, 5.6vw, 4.75rem)',
          { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' },
        ],
        // 区块标题，30px–40px
        title: [
          'clamp(1.875rem, 3.4vw, 2.5rem)',
          { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' },
        ],
      },
      borderRadius: {
        DEFAULT: '8px',
        card: '16px',
        tile: '20px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(14, 26, 21, 0.04)',
        // 卡片：一层贴边阴影 + 一层很淡的远阴影
        card: '0 1px 2px rgba(14, 26, 21, 0.04), 0 4px 16px -8px rgba(14, 26, 21, 0.08)',
        'card-hover':
          '0 1px 2px rgba(14, 26, 21, 0.05), 0 16px 36px -14px rgba(14, 26, 21, 0.18)',
        // 悬浮层：下拉、弹窗、提示
        pop: '0 2px 6px rgba(14, 26, 21, 0.06), 0 12px 32px -8px rgba(14, 26, 21, 0.18)',
        // 主按钮：顶部 1px 高光 + 贴边橄榄色阴影
        btn: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 2px rgba(77, 106, 6, 0.35)',
        // 首屏面试台
        console:
          '0 1px 2px rgba(14, 26, 21, 0.05), 0 32px 80px -32px rgba(77, 106, 6, 0.3)',
        // 首屏玻璃卡片：压在水晶前面
        glass:
          'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 1px 2px rgba(14, 26, 21, 0.05), 0 24px 60px -24px rgba(14, 26, 21, 0.28)',
      },
      maxWidth: {
        page: '1200px',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        caret: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        dot: {
          '0%, 80%, 100%': { opacity: '0.25' },
          '40%': { opacity: '1' },
        },
        // 荧光笔：从左到右划过
        mark: {
          from: { backgroundSize: '0% 100%' },
          to: { backgroundSize: '100% 100%' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        caret: 'caret 1s steps(1) infinite',
        wave: 'wave 1s ease-in-out infinite',
        marquee: 'marquee var(--marquee-duration, 48s) linear infinite',
        dot: 'dot 1.2s ease-in-out infinite',
        mark: 'mark 0.7s cubic-bezier(0.6, 0, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};
