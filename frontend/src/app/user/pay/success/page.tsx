'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, message, Tag } from 'antd';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import apiClient from '@/services/api/client';
import { PAYMENT_API } from '@/config/api';
import { useAuth } from '@/hooks/useAuth';
import PayResultCard from '@/components/user/PayResultCard';

// 订单状态的中文展示，未知状态直接显示原值
const STATUS_LABELS: Record<string, string> = {
  CREATED: '已创建',
  PENDING: '待支付',
  PAID: '已支付',
  FULFILLED: '已完成',
  CANCELED: '已取消',
  CANCELLED: '已取消',
  FAILED: '支付失败',
  REFUNDED: '已退款',
};

export default function PaySuccessPage() {
  const { user, isAuthenticated } = useAuth();
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const v = localStorage.getItem('payment_last_order_no');
    setOrderNo(v ? String(v) : null);
  }, []);

  useEffect(() => {
    if (!orderNo) {
      setLoading(false);
      return;
    }
    if (!isAuthenticated || !user) {
      message.warning('登录信息缺失，请重新登录后查看订单状态');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      setLoading(true);
      const maxAttempts = 18; // 約：18 * 3s = 54s
      const intervalMs = 3000;

      for (let i = 0; i < maxAttempts; i++) {
        if (cancelled) return;
        try {
          const res: any = await apiClient.post(PAYMENT_API.ORDER_QUERY, { order_no: orderNo });
          const nextStatus = res?.status ? String(res.status) : null;
          if (nextStatus) setStatus(nextStatus);

          if (nextStatus === 'PAID' || nextStatus === 'FULFILLED') {
            return;
          }
        } catch (e) {
          // webhook 可能还没处理到，允许重试
        }

        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };

    poll().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [orderNo, isAuthenticated, user]);

  const isSuccess = status === 'PAID' || status === 'FULFILLED';

  let icon = (
    <CircleAlert
      className="h-[1em] w-[1em] shrink-0 text-warning"
      strokeWidth={1.75}
      aria-hidden="true"
    />
  );
  let title = '暂未确认支付结果';
  let description = '如果你已完成付款，可能是支付平台通知稍有延迟，请稍后刷新状态。';
  if (loading) {
    icon = (
      <LoaderCircle
        className="h-[1em] w-[1em] shrink-0 animate-spin text-brand-800"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    );
    title = '正在确认支付结果';
    description = '正在查询订单状态，通常需要几秒钟，请勿关闭页面。';
  } else if (isSuccess) {
    icon = (
      <CircleCheck
        className="h-[1em] w-[1em] shrink-0 text-success"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    );
    title = '支付成功';
    description = '订单已确认支付，感谢你的支持。';
  } else if (!orderNo) {
    title = '未找到订单信息';
    description = '没有找到最近一次的支付订单，可以返回支付中心重新下单。';
  }

  const statusTag = loading ? (
    <span className="text-ink-secondary">查询中…</span>
  ) : (
    <Tag color={isSuccess ? 'success' : 'default'} className="m-0">
      {status ? (STATUS_LABELS[status] ?? status) : '未知'}
    </Tag>
  );

  return (
    <PayResultCard
      icon={icon}
      title={title}
      description={description}
      details={[
        { label: '订单号', value: <span className="font-mono">{orderNo || '-'}</span> },
        { label: '订单状态', value: statusTag },
      ]}
      note="支付状态以后台 webhook 校验和订单查询结果为准。"
      actions={
        <>
          <Button
            onClick={() => {
              window.location.href = '/user/pay';
            }}
          >
            返回支付中心
          </Button>
          {isSuccess ? (
            <Link href="/user/center">
              <Button type="primary">前往个人中心</Button>
            </Link>
          ) : (
            <Button type="primary" onClick={() => window.location.reload()} disabled={loading}>
              刷新状态
            </Button>
          )}
        </>
      }
    />
  );
}
