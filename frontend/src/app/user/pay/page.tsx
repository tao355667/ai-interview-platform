'use client';

import { useMemo, useState } from 'react';
import { Button, message, Tag } from 'antd';
import { Check, ShieldCheck } from 'lucide-react';
import apiClient from '@/services/api/client';
import { PAYMENT_API } from '@/config/api';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/common/PageHeader';

const CURRENCY_SYMBOLS: Record<string, string> = { usd: '$', cny: '¥' };
const PROVIDER_LABELS: Record<string, string> = { paypal: 'PayPal' };

export default function PayPage() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const products = useMemo(
    () => [
      {
        key: 'vip_monthly',
        label: 'VIP 月卡',
        description: '月度会员，一次性购买',
        features: ['单次付款，不自动续费', '支持 PayPal 支付', '支付结果由后台自动校验'],
        recommended: true,
        provider: 'paypal',
        product_code: 'monthly',
        price_code: 'monthly_9.99',
        amount: 999, // 最小货币单位（示例：$9.99 -> 999 cents）
        currency: 'usd',
        product_name: 'VIP Monthly Pass',
      },
    ],
    []
  );

  const handleCreateCheckout = async (p: (typeof products)[number]) => {
    if (!isAuthenticated || !user) {
      message.error('请先登录');
      return;
    }

    if (typeof window === 'undefined') return;

    const origin = window.location.origin;
    const success_url = `${origin}/user/pay/success`;
    const cancel_url = `${origin}/user/pay/cancel`;

    setLoading(true);
    try {
      const req = {
        product_code: p.product_code,
        price_code: p.price_code,
        provider: p.provider,
        amount: p.amount,
        currency: p.currency,
        product_name: p.product_name,
        success_url,
        cancel_url,
      };

      const res: any = await apiClient.post(PAYMENT_API.CHECKOUT_CREATE, req);
      if (!res?.checkout_url || !res?.order_no) {
        throw new Error('支付服务返回的数据不完整');
      }

      localStorage.setItem('payment_last_order_no', String(res.order_no));
      localStorage.setItem('payment_last_provider', String(p.provider));

      // 跳转到 PayPal approve 页面
      window.location.href = res.checkout_url;
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '发起支付失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page py-10">
      <PageHeader title="支付中心" description="选择套餐后将跳转到 PayPal 完成支付。" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div
            key={p.key}
            className={`surface-interactive flex flex-col p-6 ${p.recommended ? 'border-brand-600 hover:border-brand-600' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">{p.label}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{p.description}</p>
              </div>
              {p.recommended && (
                <Tag bordered={false} className="m-0 shrink-0 bg-brand-50 text-brand-800">
                  推荐
                </Tag>
              )}
            </div>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold leading-none text-ink tabular-nums">
                {CURRENCY_SYMBOLS[p.currency] ?? ''}
                {(p.amount / 100).toFixed(2)}
              </span>
              <span className="text-sm text-ink-secondary">{p.currency.toUpperCase()}</span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-ink-secondary">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check
                    className="h-[1em] w-[1em] shrink-0 text-xs text-brand-600"
                    aria-hidden="true"
                  />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              type="primary"
              size="large"
              block
              className="mt-6"
              onClick={() => handleCreateCheckout(p)}
              loading={loading}
            >
              {loading ? '正在跳转…' : `使用 ${PROVIDER_LABELS[p.provider] ?? p.provider} 支付`}
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-ink-secondary">
        <ShieldCheck className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
        支付结果以后台 webhook 校验为准，支付完成后会自动返回本站。
      </p>
    </div>
  );
}
