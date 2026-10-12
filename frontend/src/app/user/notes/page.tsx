'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Input, Select, Button, Table, Tag, Empty, message, Popconfirm, Segmented } from 'antd';
import { Copy, RotateCw, Search, Trash2 } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';

type Note = {
  key: number;
  type: 'press' | 'interview';
  title: string;
  source: string;
  time: string;
  tags: string[];
};

const NOTES: Note[] = [
  {
    key: 1,
    type: 'press',
    title: 'Redis持久化要点',
    source: '简历押题-Redis',
    time: '2024-11-02 12:40',
    tags: ['Redis', 'AOF'],
  },
  {
    key: 2,
    type: 'interview',
    title: 'Go并发最佳实践',
    source: '综合面试-社招',
    time: '2024-11-06 19:20',
    tags: ['Go', '并发'],
  },
  {
    key: 3,
    type: 'press',
    title: 'MySQL索引设计',
    source: '简历押题-MySQL',
    time: '2024-11-03 21:05',
    tags: ['MySQL', '索引'],
  },
];

const ANSWERS: Record<number, string> = {
  1: '在Redis持久化方面，AOF用于记录写操作日志，RDB用于快照。结合两者可以在性能与可靠性之间取得平衡：AOF建议使用everysec策略保证数据安全，RDB用于低频全量备份。对于热点与大对象需谨慎持久化，避免阻塞与膨胀。',
  2: 'Go并发最佳实践包括合理使用goroutine与channel、避免共享可变状态、通过context控制生命周期、使用sync包（如WaitGroup、Mutex）做并发协调，并配合worker池与限流实现稳定的吞吐。',
  3: 'MySQL索引设计要点：优先考虑查询条件的选择性；前缀索引优化长字符串；合理使用覆盖索引减少回表；联合索引遵循最左前缀原则；避免在高频更新的低选择性字段上建立索引。',
};

export default function NotesPage() {
  const [active, setActive] = useState<'press' | 'interview'>('press');
  const [keyword, setKeyword] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const [notes, setNotes] = useState<Note[]>(NOTES);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);

  const filtered = useMemo(() => {
    return notes
      .filter((n) => n.type === active)
      .filter((n) => (keyword ? n.title.includes(keyword) || n.source.includes(keyword) : true))
      .filter((n) => (tag ? n.tags.includes(tag) : true));
  }, [active, keyword, tag, notes]);

  const toggleExpand = (key: number) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleDelete = (key: number) => {
    setNotes((prev) => prev.filter((n) => n.key !== key));
    message.success('笔记已删除');
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text || '');
      message.success('答案已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  const resetFilters = () => {
    setKeyword('');
    setTag(undefined);
  };

  const hasFilter = Boolean(keyword || tag);
  const typeLabel = active === 'press' ? '押题笔记' : '面试笔记';

  return (
    <div className="page py-10">
      <PageHeader title="笔记列表" description="整理面试中的知识点，随时回顾" />

      {/* 分类与筛选 */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          value={active}
          onChange={(v) => setActive(v as 'press' | 'interview')}
          options={[
            { value: 'press', label: '押题笔记' },
            { value: 'interview', label: '面试笔记' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="搜索标题或来源"
            prefix={<Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            className="w-full sm:w-[220px]"
            aria-label="搜索笔记"
          />
          <Select
            placeholder="选择标签"
            allowClear
            value={tag}
            onChange={setTag}
            className="w-full sm:w-[160px]"
            aria-label="按标签筛选"
            options={[
              { value: 'Redis', label: 'Redis' },
              { value: 'AOF', label: 'AOF' },
              { value: 'Go', label: 'Go' },
              { value: '并发', label: '并发' },
              { value: 'MySQL', label: 'MySQL' },
              { value: '索引', label: '索引' },
            ]}
          />
          <Button
            icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}
            onClick={resetFilters}
            disabled={!hasFilter}
          >
            重置
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="surface overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span className="text-sm text-ink-secondary">
                  {hasFilter ? `没有符合条件的${typeLabel}，试试调整筛选条件` : `暂无${typeLabel}`}
                </span>
              }
            >
              {hasFilter ? (
                <Button onClick={resetFilters}>清除筛选</Button>
              ) : (
                <Link href="/">
                  <Button type="primary">去首页开始练习</Button>
                </Link>
              )}
            </Empty>
          </div>
        ) : (
          <Table
            rowKey="key"
            scroll={{ x: 720 }}
            expandable={{
              expandedRowRender: (row: Note) => (
                <div className="rounded-lg border border-line bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="m-0 text-sm font-semibold text-ink">参考答案与思路</h4>
                    <Tag bordered={false} className="m-0 bg-brand-50 text-brand-800">
                      AI 生成
                    </Tag>
                  </div>
                  <p className="m-0 text-sm leading-relaxed text-ink-secondary">
                    {ANSWERS[row.key] || '暂无详细内容'}
                  </p>
                  <Button
                    size="small"
                    icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                    className="mt-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(ANSWERS[row.key] || '');
                    }}
                  >
                    复制答案
                  </Button>
                </div>
              ),
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys(keys as number[]),
            }}
            onRow={(row: Note) => ({
              onClick: () => toggleExpand(row.key),
              className: 'cursor-pointer',
            })}
            pagination={{
              pageSize: 10,
              hideOnSinglePage: true,
              showTotal: (total) => (
                <span className="text-ink-secondary tabular-nums">共 {total} 条</span>
              ),
            }}
            dataSource={filtered}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                render: (text) => <span className="font-medium text-ink">{text}</span>,
              },
              {
                title: '来源',
                dataIndex: 'source',
                render: (text) => <span className="text-sm text-ink-secondary">{text}</span>,
              },
              {
                title: '标签',
                dataIndex: 'tags',
                render: (tags: string[]) => (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Tag key={t} bordered={false} className="m-0 bg-brand-50 text-brand-800">
                        {t}
                      </Tag>
                    ))}
                  </div>
                ),
              },
              {
                title: '创建时间',
                dataIndex: 'time',
                render: (text) => (
                  <span className="text-sm text-ink-secondary tabular-nums">{text}</span>
                ),
              },
              {
                title: '操作',
                width: 120,
                render: (_: any, row: Note) => (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="text"
                      icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                      aria-label="复制答案"
                      title="复制答案"
                      onClick={() => handleCopy(ANSWERS[row.key] || '')}
                    />
                    <Popconfirm
                      title="删除这条笔记？"
                      description="删除后无法恢复"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDelete(row.key)}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        aria-label="删除笔记"
                        title="删除笔记"
                      />
                    </Popconfirm>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
