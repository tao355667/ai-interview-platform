'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Form, Input, Button, message, Result, Skeleton } from 'antd';
import { Lock } from 'lucide-react';
import apiClient from '@/services/api/client';
import { useState, Suspense, type ReactNode } from 'react';

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="page py-16">
      <div className="surface mx-auto w-full max-w-md p-6 sm:p-8">{children}</div>
    </div>
  );
}

const ResetPasswordForm = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <CenteredCard>
        <Result
          status="warning"
          title="链接无效"
          subTitle="该重置链接无效或已过期，请重新申请重置密码。"
          style={{ padding: 0 }}
          extra={
            <Button type="primary" onClick={() => router.push('/')}>
              返回首页
            </Button>
          }
        />
      </CenteredCard>
    );
  }

  const onFinish = async (values: any) => {
    if (values.password !== values.confirm) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/user/password/reset', {
        token,
        password: values.password,
        confirm_password: values.confirm,
      });
      message.success('密码重置成功，请重新登录');
      router.push('/');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CenteredCard>
      <div className="mb-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-800">
          <Lock className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-ink">重置密码</h1>
        <p className="mt-1 text-sm text-ink-secondary">设置一个新的登录密码，至少 6 位。</p>
      </div>
      <Form onFinish={onFinish} layout="vertical" requiredMark={false}>
        <Form.Item
          name="password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码长度至少为 6 位' },
          ]}
        >
          <Input.Password placeholder="请输入新密码" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          rules={[{ required: true, message: '请确认新密码' }]}
        >
          <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block size="large">
          重置密码
        </Button>
      </Form>
    </CenteredCard>
  );
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <CenteredCard>
          <Skeleton active paragraph={{ rows: 4 }} />
        </CenteredCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
