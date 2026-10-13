'use client';

import { Button, Dropdown, Modal, Tabs, Form, Input, message, Drawer } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { ChevronDown, Menu, UserRound } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import apiClient from '@/services/api/client';
import { useAuth } from '@/hooks/useAuth';
import { USER_API } from '@/config/api';
import { INTERVIEW_TYPE_LIST } from '@/config/interviewTypes';

const MANUAL_URL = 'https://awq7m8b63wy.feishu.cn/wiki/Cl8mwzOayiTtaZknRU2cyoFHndL';

type AuthTab = 'login' | 'register' | 'forgot';

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      clipRule="evenodd"
    />
  </svg>
);

const Navbar: FC = () => {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const { user, isAuthenticated: authed, login, logout: authLogout } = useAuth();
  const [openAuth, setOpenAuth] = useState(false);
  const [activeKey, setActiveKey] = useState<AuthTab>('login');
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [forgotPasswordForm] = Form.useForm();
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // 页面滚动后才显示底部分隔线，首屏保持通透
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openAuthModal = (tab: AuthTab = 'login') => {
    setActiveKey(tab);
    setOpenAuth(true);
  };

  const doLogin = async (values: { email: string; password: string }) => {
    setLoginLoading(true);
    try {
      const res: any = await apiClient.post(USER_API.LOGIN, values);
      const data = res?.data || res;
      const token = data?.token || data?.accessToken;
      if (!token) {
        message.error('登录失败：未获取到登录凭证');
        return;
      }
      localStorage.setItem('token', token);
      try {
        document.cookie = `token=${token};path=/;max-age=${60 * 60 * 24}`;
      } catch {}
      if (data?.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
        login(data.user);
      } else {
        localStorage.setItem('user', JSON.stringify({ email: values.email }));
        login({ id: '0', email: values.email, name: values.email, username: values.email });
      }
      setOpenAuth(false);
      message.success('登录成功');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const doRegister = async (values: { username: string; email: string; password: string }) => {
    setRegisterLoading(true);
    try {
      const data: any = await apiClient.post(USER_API.REGISTER, values);
      const token = data?.token;
      const userData = data?.user;
      if (!token || !userData) {
        message.error('注册失败');
        return;
      }
      localStorage.setItem('token', token);
      try {
        document.cookie = `token=${token};path=/;max-age=${60 * 60 * 24}`;
      } catch {}
      localStorage.setItem('user', JSON.stringify(userData));
      login(userData);
      setOpenAuth(false);
      setGuideModalOpen(true);
      message.success('注册成功');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '注册失败');
    } finally {
      setRegisterLoading(false);
    }
  };

  const doForgotPassword = async (values: { email: string }) => {
    setForgotLoading(true);
    try {
      await apiClient.post('/user/password/forgot', values);
      message.success('重置链接已发送到你的邮箱，请注意查收');
      setActiveKey('login');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '发送失败，请稍后重试');
    } finally {
      setForgotLoading(false);
    }
  };

  const doGitHubLogin = async () => {
    setGithubLoading(true);
    try {
      const res: any = await apiClient.get(USER_API.GITHUB_LOGIN);
      const loginUrl = res?.login_url || res?.data?.login_url;
      if (!loginUrl) {
        message.error('获取 GitHub 登录地址失败');
        setGithubLoading(false);
        return;
      }
      window.location.href = loginUrl;
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || 'GitHub 登录失败');
      setGithubLoading(false);
    }
  };

  const doGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const res: any = await apiClient.get('/user/google/login');
      const loginUrl = res?.login_url || res?.data?.login_url;
      if (!loginUrl) {
        message.error('获取 Google 登录地址失败');
        setGoogleLoading(false);
        return;
      }
      window.location.href = loginUrl;
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || 'Google 登录失败');
      setGoogleLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/user/logout', {});
    } catch (e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authLogout();
    message.success('已退出登录');
    router.push('/');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const interviewActive = pathname.startsWith('/interview');

  const navLinkClass = (active: boolean) =>
    `inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm transition-colors duration-150 ${
      active
        ? 'bg-ink/[0.05] font-medium text-ink'
        : 'text-ink-secondary hover:bg-ink/[0.04] hover:text-ink'
    }`;

  const interviewMenu: MenuProps['items'] = INTERVIEW_TYPE_LIST.map((t) => ({
    key: t.kind,
    label: (
      <Link href={t.href} className="flex items-center gap-3 py-1.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${t.toneClass}`}
        >
          {t.icon}
        </span>
        <span className="flex flex-col">
          <span className="font-medium text-ink">{t.label}</span>
          <span className="text-xs text-ink-secondary">{t.description}</span>
        </span>
      </Link>
    ),
  }));

  const userMenu: MenuProps['items'] = [
    { key: 'center', label: <Link href="/user/center">个人中心</Link> },
    { key: 'interviews', label: <Link href="/user/interviews">面试记录</Link> },
    { key: 'press', label: <Link href="/user/press">押题记录</Link> },
    { key: 'notes', label: <Link href="/user/notes">我的笔记</Link> },
    { key: 'pay', label: <Link href="/user/pay">充值</Link> },
    { type: 'divider' },
    { key: 'logout', danger: true, label: '退出登录', onClick: logout },
  ];

  const oauthButtons = (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-3 text-center text-xs text-ink-secondary">其他登录方式</div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          icon={<GoogleIcon />}
          loading={googleLoading}
          disabled={githubLoading}
          onClick={doGoogleLogin}
        >
          Google
        </Button>
        <Button
          icon={<GitHubIcon />}
          loading={githubLoading}
          disabled={googleLoading}
          onClick={doGitHubLogin}
        >
          GitHub
        </Button>
      </div>
    </div>
  );

  const emailRules = [
    { required: true, message: '请输入邮箱' },
    { type: 'email' as const, message: '邮箱格式不正确' },
  ];

  const drawerLinkClass = (active: boolean) =>
    `block rounded-xl px-3 py-3 text-[15px] transition-colors duration-150 ${
      active ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink hover:bg-canvas'
    }`;

  return (
    <header
      className={`sticky top-0 z-40 h-16 w-full border-b bg-white/80 backdrop-blur-md transition-colors duration-200 supports-[backdrop-filter]:bg-white/70 ${
        scrolled ? 'border-line' : 'border-transparent'
      }`}
    >
      <div className="page flex h-full items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="面试吧首页">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-600 text-[15px] font-semibold text-ink shadow-btn">
            面
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-ink">面试吧</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 pl-8 lg:flex" aria-label="主导航">
          <Link href="/resume" className={navLinkClass(isActive('/resume'))}>
            简历押题
          </Link>
          <Dropdown menu={{ items: interviewMenu }} placement="bottomLeft">
            <button type="button" className={navLinkClass(interviewActive)}>
              模拟面试
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Dropdown>
          <Link href="/questions" className={navLinkClass(isActive('/questions'))}>
            题库
          </Link>
          <a href={MANUAL_URL} target="_blank" rel="noreferrer" className={navLinkClass(false)}>
            使用手册
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {authed ? (
            <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
              <Button icon={<UserRound className="h-4 w-4" aria-hidden="true" />}>
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {user?.username || user?.email?.split('@')[0] || '用户'}
                </span>
              </Button>
            </Dropdown>
          ) : (
            <>
              <Button className="hidden sm:inline-flex" onClick={() => openAuthModal('login')}>
                登录
              </Button>
              <Button type="primary" onClick={() => openAuthModal('register')}>
                注册
              </Button>
            </>
          )}
          <Button
            type="text"
            aria-label="打开菜单"
            icon={<Menu className="h-5 w-5" aria-hidden="true" />}
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
          />
        </div>
      </div>

      <Drawer
        placement="right"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width="min(100vw, 360px)"
        title="面试吧"
      >
        <nav className="flex flex-col gap-1" onClick={() => setDrawerOpen(false)}>
          <Link href="/resume" className={drawerLinkClass(isActive('/resume'))}>
            简历押题
          </Link>
          <div className="px-3 pb-1 pt-3 text-xs text-ink-secondary">模拟面试</div>
          {INTERVIEW_TYPE_LIST.map((t) => (
            <Link key={t.kind} href={t.href} className={drawerLinkClass(isActive(t.href))}>
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded text-xs ${t.toneClass}`}
                >
                  {t.icon}
                </span>
                {t.label}
              </span>
            </Link>
          ))}
          <div className="my-2 border-t border-line" />
          <Link href="/questions" className={drawerLinkClass(isActive('/questions'))}>
            题库
          </Link>
          <a href={MANUAL_URL} target="_blank" rel="noreferrer" className={drawerLinkClass(false)}>
            使用手册
          </a>
        </nav>
      </Drawer>

      <Modal
        open={openAuth}
        onCancel={() => setOpenAuth(false)}
        footer={null}
        title="登录面试吧"
        width={420}
        destroyOnHidden
      >
        <Tabs
          activeKey={activeKey}
          onChange={(k) => setActiveKey(k as AuthTab)}
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form form={loginForm} layout="vertical" onFinish={doLogin} requiredMark={false}>
                  <Form.Item label="邮箱" name="email" rules={emailRules}>
                    <Input placeholder="请输入邮箱" autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    label="密码"
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password placeholder="请输入密码" autoComplete="current-password" />
                  </Form.Item>
                  <div className="-mt-2 mb-4 flex justify-end">
                    <Button
                      type="link"
                      size="small"
                      className="px-0"
                      onClick={() => setActiveKey('forgot')}
                    >
                      忘记密码？
                    </Button>
                  </div>
                  <Button type="primary" htmlType="submit" block loading={loginLoading}>
                    登录
                  </Button>
                  {oauthButtons}
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form
                  form={registerForm}
                  layout="vertical"
                  onFinish={doRegister}
                  requiredMark={false}
                >
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input placeholder="请输入用户名" autoComplete="username" />
                  </Form.Item>
                  <Form.Item label="邮箱" name="email" rules={emailRules}>
                    <Input placeholder="请输入邮箱" autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    label="密码"
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password placeholder="请设置密码" autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={registerLoading}>
                    注册并登录
                  </Button>
                  {oauthButtons}
                </Form>
              ),
            },
            {
              key: 'forgot',
              label: '找回密码',
              children: (
                <Form
                  form={forgotPasswordForm}
                  layout="vertical"
                  onFinish={doForgotPassword}
                  requiredMark={false}
                >
                  <p className="mb-4 text-sm text-ink-secondary">
                    输入注册时使用的邮箱，我们会发送一封重置密码的邮件。
                  </p>
                  <Form.Item label="邮箱" name="email" rules={emailRules}>
                    <Input placeholder="请输入邮箱" autoComplete="email" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={forgotLoading}>
                    发送重置链接
                  </Button>
                  <div className="mt-3 text-center">
                    <Button type="link" size="small" onClick={() => setActiveKey('login')}>
                      返回登录
                    </Button>
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        open={guideModalOpen}
        onCancel={() => setGuideModalOpen(false)}
        footer={null}
        title="欢迎来到面试吧"
        centered
        width={480}
      >
        <div className="py-2">
          <p className="text-base font-medium text-ink">先上传一份简历</p>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            在个人中心上传简历后，AI
            会根据你的项目和技能生成针对性的面试题，模拟面试也会围绕简历展开。
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setGuideModalOpen(false)}>稍后再说</Button>
            <Button
              type="primary"
              onClick={() => {
                setGuideModalOpen(false);
                router.push('/user/center');
              }}
            >
              去上传简历
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  );
};

export default Navbar;
