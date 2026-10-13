import type { ThemeConfig } from 'antd';

// 设计令牌：与 tailwind.config.js 中的颜色保持一致
export const colors = {
  /** 荧光黄绿：只做填充，上面的文字用 ink */
  brand: '#BFEA2E',
  brandHover: '#CFF25A',
  brandActive: '#9CC41A',
  /** 浅底上的文字和链接：荧光黄绿直接做文字对比度只有约 1.4:1 */
  brandText: '#4D6A06',
  brandTextHover: '#36490A',
  brandSoft: '#F7FDE7',
  brandBorder: '#DDF59A',
  accent: '#1266D0',
  canvas: '#F7F8F7',
  surface: '#FFFFFF',
  line: '#E4E8E6',
  lineStrong: '#CDD4D0',
  ink: '#0E1A15',
  inkSecondary: '#56635D',
  inkMuted: '#8A958F',
  success: '#0B7F59',
  warning: '#B7791F',
  danger: '#D14343',
};

const fontSans =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif';

const popShadow = '0 2px 6px rgba(14, 26, 21, 0.06), 0 12px 32px -8px rgba(14, 26, 21, 0.18)';
const cardShadow = '0 1px 2px rgba(14, 26, 21, 0.04), 0 4px 16px -8px rgba(14, 26, 21, 0.08)';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.brand,
    colorPrimaryHover: colors.brandHover,
    colorPrimaryActive: colors.brandActive,
    colorPrimaryText: colors.brandText,
    colorPrimaryTextHover: colors.brandTextHover,
    colorPrimaryTextActive: colors.brandTextHover,
    colorPrimaryBg: colors.brandSoft,
    colorPrimaryBorder: colors.brandBorder,
    colorInfo: colors.accent,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorLink: colors.brandText,
    colorLinkHover: colors.brandTextHover,
    colorLinkActive: colors.brandTextHover,
    colorText: colors.ink,
    colorTextSecondary: colors.inkSecondary,
    colorTextTertiary: colors.inkMuted,
    colorTextPlaceholder: colors.inkMuted,
    colorBorder: colors.lineStrong,
    colorBorderSecondary: colors.line,
    colorBgLayout: colors.canvas,
    fontFamily: fontSans,
    fontSize: 14,
    borderRadius: 10,
    borderRadiusLG: 16,
    borderRadiusSM: 6,
    controlHeight: 38,
    controlHeightLG: 46,
    motionDurationMid: '0.15s',
    motionDurationSlow: '0.2s',
    boxShadow: popShadow,
    boxShadowSecondary: popShadow,
  },
  components: {
    Button: {
      // 荧光黄绿按钮上用墨黑文字；默认按钮悬停时只加深边框，文字保持墨黑
      primaryColor: colors.ink,
      primaryShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 2px rgba(77, 106, 6, 0.35)',
      defaultHoverColor: colors.ink,
      defaultHoverBorderColor: colors.brandText,
      defaultActiveColor: colors.ink,
      defaultActiveBorderColor: colors.brandText,
      defaultShadow: '0 1px 2px rgba(14, 26, 21, 0.04)',
      dangerShadow: 'none',
      fontWeight: 500,
    },
    Card: {
      boxShadowTertiary: cardShadow,
    },
    Layout: {
      headerBg: colors.surface,
      headerHeight: 64,
      headerPadding: 0,
      footerBg: colors.surface,
      bodyBg: colors.canvas,
    },
    Input: {
      hoverBorderColor: colors.brandActive,
      activeBorderColor: colors.brandText,
      activeShadow: '0 0 0 3px rgba(191, 234, 46, 0.35)',
    },
    Select: {
      hoverBorderColor: colors.brandActive,
      activeBorderColor: colors.brandText,
      activeOutlineColor: 'rgba(191, 234, 46, 0.35)',
      optionSelectedBg: colors.brandSoft,
      optionSelectedColor: colors.ink,
    },
    Pagination: {
      itemActiveBg: colors.brand,
      itemActiveColor: colors.ink,
      itemActiveColorHover: colors.ink,
      colorPrimary: colors.brandText,
      colorPrimaryHover: colors.brandTextHover,
    },
    Steps: {
      colorTextLightSolid: colors.ink,
    },
    Dropdown: {
      colorPrimary: colors.brandText,
    },
    Menu: {
      itemSelectedBg: colors.brandSoft,
      itemSelectedColor: colors.brandText,
    },
    Table: {
      headerBg: '#F7F8F7',
      headerColor: colors.inkSecondary,
    },
    Tabs: {
      itemSelectedColor: colors.ink,
      itemHoverColor: colors.brandText,
      itemActiveColor: colors.brandText,
      inkBarColor: colors.brandText,
    },
  },
};
