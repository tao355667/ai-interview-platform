'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Spin, Result, Button } from 'antd';
import apiClient from '@/services/api/client';
import { useAuthStore } from '@/store/authStore';

export type OAuthProvider = 'github' | 'google';

const PROVIDERS: Record<
  OAuthProvider,
  { label: string; endpoint: string; fallbackName: string; fallbackUsername: string }
> = {
  github: {
    label: 'GitHub',
    endpoint: '/user/github/callback',
    fallbackName: 'GitHub 用户',
    fallbackUsername: 'github_user',
  },
  google: {
    label: 'Google',
    endpoint: '/user/google/callback',
    fallbackName: 'Google 用户',
    fallbackUsername: 'google_user',
  },
};

/** 第三方登录回调页的居中卡片 */
export function OAuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="page py-16">
      <div className="surface mx-auto w-full max-w-md px-6 py-10">{children}</div>
    </div>
  );
}

export function OAuthLoading({ text }: { text: string }) {
  return (
    <OAuthCard>
      <div
        className="flex flex-col items-center gap-4 text-center"
        role="status"
        aria-live="polite"
      >
        <Spin size="large" />
        <p className="text-sm text-ink-secondary">{text}</p>
      </div>
    </OAuthCard>
  );
}

export default function OAuthCallback({ provider }: { provider: OAuthProvider }) {
  const cfg = PROVIDERS[provider];
  const searchParams = useSearchParams();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const didRun = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setErrorMsg(`缺少授权码，请回到登录页重新使用 ${cfg.label} 登录`);
      setStatus('error');
      return;
    }

    // 防止 React Strict Mode 或依赖变化导致 effect 执行两次，用同一 code 重复请求会报错并先显示"登录失败"
    if (didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        const res: any = await apiClient.post(cfg.endpoint, { code }, { timeout: 30000 });
        const data = res?.data ?? res;
        const token = data?.token || data?.accessToken;
        if (!token) {
          setErrorMsg('登录失败：服务端未返回登录凭证');
          setStatus('error');
          return;
        }
        localStorage.setItem('token', token);
        try {
          document.cookie = `token=${token};path=/;max-age=${60 * 60 * 24}`;
        } catch {}
        const user = data?.user;
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
          login({
            id: String(user.id ?? user.ID ?? ''),
            username: user.username,
            name: user.nickname ?? user.name ?? user.username,
            email: user.email ?? '',
            avatar: user.avatar,
          });
        } else {
          login({ id: '0', email: '', name: cfg.fallbackName, username: cfg.fallbackUsername });
        }
        setStatus('success');
        setTimeout(() => router.replace('/'), 800);
      } catch (e: any) {
        const isTimeout =
          e?.code === 'ECONNABORTED' || String(e?.message || '').includes('timeout');
        const msg = isTimeout
          ? `${cfg.label} 登录请求超时，请检查后端服务后重试`
          : e?.response?.data?.message || e?.message || `${cfg.label} 登录校验失败，请重试`;
        setErrorMsg(msg);
        setStatus('error');
      }
    })();
  }, [searchParams, login, router, cfg]);

  if (status === 'loading') {
    return <OAuthLoading text={`正在完成 ${cfg.label} 登录…`} />;
  }

  if (status === 'error') {
    return (
      <OAuthCard>
        <Result
          status="error"
          title="登录失败"
          subTitle={errorMsg}
          style={{ padding: 0 }}
          extra={[
            <Button type="primary" key="retry" onClick={() => router.push('/')}>
              重新登录
            </Button>,
            <Button key="home" onClick={() => router.push('/')}>
              返回首页
            </Button>,
          ]}
        />
      </OAuthCard>
    );
  }

  return <OAuthLoading text="登录成功，正在跳转…" />;
}
