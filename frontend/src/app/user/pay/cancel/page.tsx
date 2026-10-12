'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import { CircleAlert } from 'lucide-react';
import PayResultCard from '@/components/user/PayResultCard';

export default function PayCancelPage() {
  const [orderNo, setOrderNo] = useState<string | null>(null);

  useEffect(() => {
    const v = localStorage.getItem('payment_last_order_no');
    setOrderNo(v ? String(v) : null);
  }, []);

  return (
    <PayResultCard
      icon={
        <CircleAlert
          className="h-[1em] w-[1em] shrink-0 text-warning"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      }
      title="支付已取消"
      description="你已取消本次支付流程，需要时可以随时重新下单。"
      details={[{ label: '订单号', value: <span className="font-mono">{orderNo || '-'}</span> }]}
      actions={
        <>
          <Link href="/">
            <Button>返回首页</Button>
          </Link>
          <Button
            type="primary"
            onClick={() => {
              window.location.href = '/user/pay';
            }}
          >
            重新支付
          </Button>
        </>
      }
    />
  );
}
