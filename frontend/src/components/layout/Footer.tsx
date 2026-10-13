'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { FC } from 'react';
import { INTERVIEW_TYPE_LIST } from '@/config/interviewTypes';

const RESOURCE_LINKS = [
  { label: '使用手册', href: 'https://awq7m8b63wy.feishu.cn/wiki/Cl8mwzOayiTtaZknRU2cyoFHndL' },
  { label: '演示视频', href: 'https://www.bilibili.com/video/BV1DavmBzEJu/' },
  { label: '视频教程', href: 'https://www.bilibili.com/video/BV1UCmEBQEW8/' },
  { label: '课程介绍', href: 'https://mp.weixin.qq.com/s/DlKoCQ7zUitCoiSoZzdVCQ' },
];

const Footer: FC = () => {
  const pathname = usePathname() || '';

  // 面试房间是全屏对话界面，不显示页脚
  if (/^\/interview\/[^/]+\/start/.test(pathname)) return null;

  return (
    <footer className="border-t border-line bg-white">
      <div className="page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-ink shadow-btn">
              面
            </span>
            <span className="font-semibold text-ink">面策</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-ink-secondary">
            基于真实大厂题库的 AI 模拟面试平台，从简历押题到专项突破，帮你在面试前发现并补上短板。
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-ink">模拟面试</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {INTERVIEW_TYPE_LIST.map((t) => (
              <li key={t.kind}>
                <Link href={t.href} className="text-ink-secondary hover:text-brand-800">
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-medium text-ink">学习资源</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {RESOURCE_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-secondary hover:text-brand-800"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="page py-4 text-xs text-ink-secondary">
          © {new Date().getFullYear()} 面策
        </div>
      </div>
    </footer>
  );
};

export default Footer;
