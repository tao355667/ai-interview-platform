# 前端设计规范

风格：**高级浅色 SaaS（Premium Light SaaS）**。现代极简、字体排版有层次、Bento 网格、克制的微动效、具有 AI 产品特征。

原则：高级感优先于炫酷感，统一性优先于特效数量，产品体验优先于视觉装饰。大胆只用在一处（首页首屏的「线索」装置），其余区域保持安静。

## 颜色

颜色定义在 `tailwind.config.js`，antd 主题在 `src/theme/tokens.ts`，两边保持一致。**不要在组件里写十六进制色值**（第三方品牌图标、SVG 图形的描边/填充除外）。

| 名称 | Tailwind 类 | 色值 | 用途 |
|---|---|---|---|
| 纸白 | `bg-canvas` | `#F7F8F7` | 页面底色 |
| 卡片白 | `bg-white` | `#FFFFFF` | 卡片 |
| 墨黑 | `text-ink` | `#0E1A15` | 标题、正文 |
| 辅文 | `text-ink-secondary` | `#56635D` | 描述、标签名、时间 |
| 弱化 | `text-ink-muted` | `#8A958F` | 仅占位符、禁用、计数等非关键信息 |
| 荧光黄绿（主色） | `bg-brand-600` | `#BFEA2E` | **只做填充**：主按钮、选中态、进度条、荧光笔 `.mark`；上面的文字一律用墨黑 `text-ink` |
| 深橄榄 | `text-brand-800` | `#4D6A06` | 浅底上的品牌色文字、链接、图标、焦点描边（荧光黄绿做文字对比度只有约 1.4:1） |
| 森林墨绿 | `bg-forest` | `#0F1F17` | **全站唯一的深色区块**（首页简历押题），荧光黄绿在上面可以直接做文字 |
| 浅荧光 | `mint` | `#D9F58A` | 深色区块上的强调文字和局部光晕 |
| 分隔线 | `border-line` / `border-line-strong` | `#E4E8E6` / `#CDD4D0` | 边框、分割线、输入框 |
| 辅助色 | `accent-*` / `violet-*` / `warning` | | 只用于图标和小标签的类型区分 |
| 语义色 | `success` / `warning` / `danger` 及 `*-soft` | | 状态、分数、错误 |

面试类型的颜色统一从 `src/config/interviewTypes.ts` 的 `toneClass` 读取（社招绿、校招蓝、专项紫、多人琥珀）。

### 渐变与光效（只允许以下几种）

- 首屏装置背后的一团荧光、深色区块里的一团浅荧光光晕、结尾 CTA 顶部的柔光（`radial-gradient`，低透明度）
- 首屏对话卡片的玻璃效果（`bg-white/60 backdrop-blur-xl shadow-glass`），只用在压在装置上的卡片
- 主按钮顶部 1px 高光（`shadow-btn`）
- 首屏淡网格底纹 `.bg-grid`

**不要**：整页渐变、渐变文字、霓虹色、大面积毛玻璃（导航栏的轻微磨砂除外）、彩色大阴影。

## 字体与排版

- 字体：**只用各平台系统无衬线字体**（`--font-sans`），不引入网络字体
- 层次靠字号、字重、字距和留白：

| 层级 | 用法 | 规格 |
|---|---|---|
| 首屏大标题 | `text-display` | 40–76px 随屏宽缩放，行高 1.08，字距 −0.025em，600 |
| 区块标题 | `text-title` | 30–40px，行高 1.2，600 |
| 页面标题 | `PageHeader` | 28–32px，600 |
| 卡片标题 | `text-lg` / `text-xl font-semibold` | |
| 正文 | `text-[15px] leading-7` / `text-base leading-7` | 中文需要较大行高 |
| 小标签 | `.eyebrow` | 13px 深青玉，说明这一块讲什么；不用英文大写 |

- 中文标题按“，”拆成短语，短语内部不换行：区块标题用 `SectionHeading`（自动处理），其他地方用 `phrases()`，避免“多人面 / 试”式拆词
- 数字加 `tabular-nums`；中英文之间加空格
- 字重只用 400 / 500 / 600，不用 `font-extrabold`、`font-serif`，不小于 12px

## 形状与层次

| 令牌 | 值 | 用途 |
|---|---|---|
| `rounded` | 8px | 小元素 |
| `rounded-[10px]` | 10px | 按钮、输入框（antd 已配置） |
| `rounded-card` | 16px | 卡片 |
| `rounded-tile` | 20px | Bento 卡片、面试台 |
| `rounded-[28px]` | 28px | 整块区域（深色区块、结尾 CTA） |
| `shadow-xs` / `shadow-card` / `shadow-card-hover` | | 卡片默认用 `shadow-card`，hover 用 `shadow-card-hover` |
| `shadow-pop` | | 下拉、弹窗、提示 |
| `shadow-btn` | | 主按钮 |

通用类（`globals.css`）：

- `.page`：内容容器（最大 1200px，两侧留白）
- `.surface`：白底 + 边框 + 淡阴影的卡片
- `.surface-interactive`：可点击卡片，hover 时边框变深、阴影加深、上浮 1px
- `.link-btn-primary` / `.link-btn-default` / `.link-btn-lg`：链接形式的按钮（避免在 `<Link>` 里嵌套 `<button>`）
- `.spotlight`：光标跟随柔光，配合 `Spotlight` 组件使用

## Bento 网格

- 用尺寸表达主次：主推内容占大格（如首页社招 `lg:col-span-2 lg:row-span-2`），同一行避免卡片等宽等高
- 每张卡片放一个**微型产品界面**（对话、评分条、声波、走势图、可点击的切换），不要只放“图标 + 标题 + 一段话”
- 卡片里的示意内容用 `flex-1 justify-end` 对齐到底部，保证同一行底部对齐
- 移动端统一变单列；序号只用于真实的先后流程（如简历押题四步）

## 动效

动画库：`motion`（通过 `MotionProvider` 全局启用 `LazyMotion` + `m` 组件，`strict` 模式下误用 `motion.*` 会直接报错）。

| 场景 | 实现 | 规格 |
|---|---|---|
| 首屏入场 | CSS `animate-rise` + `animationDelay` | 600ms，错峰 80ms，只播一次 |
| 区块进入视口 | `<Reveal>` | 淡入 + 上移 8px，450ms，只播一次 |
| Bento 卡片 hover | `.spotlight` + 上浮 1px | 200ms |
| 数字 | `<NumberTicker>` | 进入视口时滚动 |
| 流程 / 协作连线 | `<AnimatedBeam>` | |
| 首屏「线索」装置 | 自研 WebGL（`components/home/hero/crystalRenderer.ts`） | 镂空金属外壳 + 透明水晶 + 三道丝线轨道环；倾听 / 思考 / 追问三种形态；滚动时轨道环垂下接到「四种面试模式」卡片（`data-thread-anchor`）。调试页 `/lab/hero` |

规则：

- 每屏最多 1–2 个持续运动的元素；声波等装饰动画默认静止，hover 时才运动
- 只动 `transform` / `opacity`，不动宽高（进度条宽度除外）
- 必须支持“减弱动态效果”：`MotionConfig reducedMotion="user"` 关闭位移动画；CSS 动画由 `globals.css` 的媒体查询统一关闭；首屏装置只渲染一帧静态画面；评价滚动条改为可手动横向滚动

## 组件与来源

| 组件 | 位置 | 来源 |
|---|---|---|
| `NumberTicker` / `AnimatedBeam` | `src/components/motion/` | 移植自 [Magic UI](https://magicui.design/)（MIT），改为 Tailwind v3 + `m` 组件 |
| `Spotlight` | `src/components/motion/` | 思路参考 [React Bits](https://reactbits.dev/) Spotlight Card，纯 CSS 变量实现 |
| `Reveal` / `MotionProvider` | `src/components/motion/` | 基于 [Motion](https://motion.dev/) |
| 图标 | `lucide-react` | 装饰图标加 `aria-hidden`，纯图标按钮必须有中文 `aria-label` |

不要引入 shadcn CLI、Tailwind v4 或 GSAP；需要新组件时手工移植并适配本规范。

## 布局与页面结构

- 首页是服务端组件，只有交互/动画部分是客户端组件（`src/components/home/`）
- 普通页面：

```tsx
<div className="page py-10">
  <PageHeader title="面试记录" description="查看历史面试和评估报告" actions={<Button>...</Button>} />
  ...
</div>
```

- 导航栏高 64px，全屏页面（如面试房间）用 `h-[calc(100dvh-64px)]`

## 交互

- 加载：列表和详情用 antd `Skeleton`，按钮用 `loading`；不要整页转圈
- 空状态：antd `Empty`，配一句说明和一个引导按钮
- 反馈：成功/失败用 `message`，危险操作用 `Modal.confirm` 或 `Popconfirm`
- 键盘：可点击的 `div` 改成 `button` 或 `Link`；全局已提供 `:focus-visible` 描边

## 文案

- 全站中文，从用户视角写：按钮用动词（“开始模拟面试”“上传简历押题”），说清楚点了会发生什么
- 中英文之间加空格（“AI 面试”“Go 开发”），不用感叹号
- 首页的统计数字和用户评价目前是占位内容（代码注释已标注），上线前替换为真实数据
- 品牌名：面试吧
