import type { ThemeConfig } from 'antd';

// 设计令牌：与 tailwind.config.js 中的颜色保持一致
export const colors = {
  brand: '#10BB83',
  brandHover: '#0E9F70',
  brandActive: '#0B7F59',
  /** 绿色文字和链接：#10BB83 直接做文字对比度不够 */
  brandText: '#0B7F59',
  brandSoft: '#E8F8F1',
  brandBorder: '#A8E4CC',
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
    colorPrimaryTextHover: colors.brandHover,
    colorPrimaryTextActive: colors.brandActive,
    colorPrimaryBg: colors.brandSoft,
    colorPrimaryBorder: colors.brandBorder,
    colorInfo: colors.accent,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorLink: colors.brandText,
    colorLinkHover: colors.brandHover,
    colorLinkActive: colors.brandActive,
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
      primaryShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 1px 2px rgba(11, 127, 89, 0.32)',
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
    Menu: {
      itemSelectedBg: colors.brandSoft,
      itemSelectedColor: colors.brandText,
    },
    Table: {
      headerBg: '#F7F8F7',
      headerColor: colors.inkSecondary,
    },
    Tabs: {
      itemSelectedColor: colors.brandText,
      itemHoverColor: colors.brandHover,
      inkBarColor: colors.brand,
    },
  },
};
