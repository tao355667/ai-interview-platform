'use client';

import { useState, useMemo } from 'react';
import { Tag, Input, Button, Empty } from 'antd';
import {
  Bot,
  Boxes,
  Cloud,
  Code2,
  Database,
  Flame,
  Inbox,
  Plug,
  Search,
  Workflow,
} from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';

type Item = {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tags: string[];
  popular?: boolean;
  count?: number;
};

const TAGS = [
  '最受欢迎',
  'Java 题库',
  'Golang 题库',
  'C++ 题库',
  '计算机基础',
  '数据库',
  '编程语言',
  '前端题库',
  '后端组件',
  '后端工具',
  '场景设计',
  '云原生',
  'AI 题库',
  'AI 理论',
  'AI 编程',
  '全部',
];

const DATA: Item[] = [
  {
    key: 'java-base',
    title: 'Java 基础',
    desc: '聚焦 Java 核心入门知识，涵盖变量与数据类型、面向对象等',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Java 题库', '编程语言'],
    popular: true,
    count: 120,
  },
  {
    key: 'java-collection',
    title: 'Java 集合',
    desc: '聚焦 Java 集合框架（List、Map、Set 等）的实现与应用',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Java 题库', '编程语言'],
    count: 85,
  },
  {
    key: 'java-concurrency',
    title: 'Java 并发',
    desc: '剖析 Java 多线程、锁机制、并发工具类与实战',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Java 题库'],
    count: 96,
  },
  {
    key: 'jvm',
    title: 'Java 虚拟机',
    desc: '深入 JVM 内存模型、类加载、垃圾回收等核心机制',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Java 题库'],
    count: 74,
  },
  {
    key: 'go-base',
    title: 'Golang 基础',
    desc: '涵盖变量类型、函数、goroutine、通道与错误处理',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Golang 题库', '编程语言'],
    popular: true,
    count: 110,
  },
  {
    key: 'go-container',
    title: 'Golang 容器',
    desc: '探索 Go 语言容器（数组、切片、映射等）的实现与性能',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Golang 题库'],
    count: 45,
  },
  {
    key: 'go-concurrency',
    title: 'Golang 并发',
    desc: '围绕 Goroutine、Channel、同步原语等并发模型',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Golang 题库'],
    count: 68,
  },
  {
    key: 'go-gc',
    title: 'Golang GC',
    desc: '剖析 Go 垃圾回收机制、GC 算法与调优',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['Golang 题库'],
    count: 32,
  },
  {
    key: 'cpp',
    title: 'C++',
    desc: '涵盖面向对象、STL 容器、内存管理等核心知识',
    icon: <Code2 className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['C++ 题库', '编程语言'],
    count: 150,
  },
  {
    key: 'redis',
    title: 'Redis',
    desc: '覆盖 Redis 数据结构、缓存策略、集群架构与持久化',
    icon: <Database className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['数据库', '后端组件'],
    popular: true,
    count: 200,
  },
  {
    key: 'mysql',
    title: 'MySQL',
    desc: '涵盖 SQL 优化、索引设计、事务机制、锁与隔离级别',
    icon: <Database className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['数据库'],
    count: 180,
  },
  {
    key: 'mq',
    title: '消息队列',
    desc: '包含 RabbitMQ、Kafka 等主流组件知识',
    icon: <Workflow className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['后端组件'],
    count: 90,
  },
  {
    key: 'ssm',
    title: 'SSM 全家桶',
    desc: '涵盖 Spring IoC AOP、Spring MVC 请求流程与实战',
    icon: <Boxes className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['后端组件'],
    count: 130,
  },
  {
    key: 'os',
    title: '操作系统',
    desc: '解析进程线程、内存调度、文件系统、IO 等',
    icon: <Inbox className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['计算机基础'],
    count: 115,
  },
  {
    key: 'network',
    title: '计算机网络',
    desc: '梳理 TCP/IP 协议栈、网络分层、链路与安全',
    icon: <Plug className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['计算机基础'],
    count: 140,
  },
  {
    key: 'scenario',
    title: '场景题',
    desc: '聚焦高并发、数据库存储、缓存策略等核心场景题',
    icon: <Cloud className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['场景设计'],
    count: 60,
  },
  {
    key: 'cloud-native',
    title: '云原生',
    desc: '容器编排、服务治理、可观测性与CI/CD 流水线',
    icon: <Cloud className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['云原生'],
    count: 75,
  },
  {
    key: 'ai-coding',
    title: 'AI 编程',
    desc: '模型调用、提示工程、工具函数与自动化工作流',
    icon: <Bot className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['AI 编程', 'AI 题库'],
    count: 40,
  },
  {
    key: 'ai-theory',
    title: 'AI 理论',
    desc: '机器学习基础、优化算法、深度学习核心概念',
    icon: <Bot className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
    tags: ['AI 理论', 'AI 题库'],
    count: 55,
  },
];

const ALL = '全部';

export default function QuestionsPage() {
  const [active, setActive] = useState<string>('最受欢迎');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let res = DATA;
    if (active !== ALL) {
      if (active === '最受欢迎') res = res.filter((i) => i.popular);
      else if (active === '编程语言')
        res = res.filter(
          (i) =>
            i.tags.includes('Java 题库') ||
            i.tags.includes('Golang 题库') ||
            i.tags.includes('C++ 题库')
        );
      else res = res.filter((i) => i.tags.includes(active));
    }

    if (search) {
      res = res.filter(
        (i) =>
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          i.desc.toLowerCase().includes(search.toLowerCase())
      );
    }
    return res;
  }, [active, search]);

  const resetFilters = () => {
    setActive(ALL);
    setSearch('');
  };

  return (
    <div className="page py-10">
      <PageHeader title="题库" description="精选真实面试题，覆盖主流技术栈和核心考点。" />

      {/* 筛选工具栏 */}
      <div className="surface mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            allowClear
            value={search}
            prefix={<Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
            placeholder="搜索题库名称或简介"
            className="w-full sm:w-72"
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-sm text-ink-secondary">
            共 <span className="tabular-nums">{filtered.length}</span> 个题库
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-y-2 border-t border-line pt-4">
          {TAGS.map((t) => (
            <Tag.CheckableTag
              key={t}
              checked={active === t}
              onChange={() => setActive(t)}
              className="px-3 py-1 text-sm"
            >
              {t === '最受欢迎' && (
                <Flame
                  className="mr-1 inline-block h-[1em] w-[1em] align-[-0.125em]"
                  aria-hidden="true"
                />
              )}
              {t}
            </Tag.CheckableTag>
          ))}
        </div>
      </div>

      {/* 题库列表 */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.key} className="surface flex h-full flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-800">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-base font-semibold text-ink">{item.title}</h3>
                    {item.popular && (
                      <Tag
                        color="warning"
                        icon={
                          <Flame
                            className="mr-1 inline-block h-3 w-3 align-[-0.125em]"
                            aria-hidden="true"
                          />
                        }
                        className="m-0"
                      >
                        热门
                      </Tag>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">
                    {item.desc}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <div className="flex flex-wrap gap-y-1">
                  {item.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink-secondary">
                  <Database className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">{item.count || 50}+</span> 道题
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface py-12">
          <Empty description="没有找到相关题库，换个关键词或分类试试">
            <Button onClick={resetFilters}>清除筛选</Button>
          </Empty>
        </div>
      )}
    </div>
  );
}
