'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { antdTheme } from '@/theme/tokens';
import MotionProvider from '@/components/motion/MotionProvider';

// 让 message / Modal.confirm 等静态方法也使用同一套主题和中文语言包
ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={antdTheme} locale={zhCN} button={{ autoInsertSpace: false }}>
      {children}
    </ConfigProvider>
  ),
});

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme} locale={zhCN} button={{ autoInsertSpace: false }}>
        <AntApp>
          <MotionProvider>{children}</MotionProvider>
        </AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
