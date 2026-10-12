'use client';

import { useState, useEffect } from 'react';
import { Table, Input, Button, message, Tag, Popconfirm, Skeleton, Empty, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RotateCw, Search, Trash2, Zap } from 'lucide-react';
import { predictionService } from '@/services/api/prediction';
import { PredictionRecordItem } from '@/types/prediction';
import PageHeader from '@/components/common/PageHeader';

import Link from 'next/link';

export default function PressRecordsPage() {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<PredictionRecordItem[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');

  const toDeleteIDs = (keys: React.Key[]): number[] => {
    return keys.map((key) => Number(key)).filter((id) => Number.isInteger(id) && id > 0);
  };

  const formatCreatedAt = (createdAt: string | number | null | undefined): string => {
    if (createdAt == null || createdAt === '') return '-';

    if (typeof createdAt === 'number' || /^\d+$/.test(String(createdAt))) {
      const numeric = Number(createdAt);
      const ms = numeric < 1e12 ? numeric * 1000 : numeric;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? String(createdAt) : date.toLocaleString();
    }

    const raw = String(createdAt).trim();
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
  };

  // 获取押题记录
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await predictionService.getPredictionList();
      if (res && res.list) {
        setData(res.list);
      }
    } catch (e) {
      console.error(e);
      message.error('获取押题记录失败');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // 批量删除
  const handleBatchDelete = async () => {
    const ids = toDeleteIDs(selectedRowKeys);
    if (ids.length === 0) {
      message.warning('没有可删除的记录');
      return;
    }

    try {
      await predictionService.deleteHistory(ids);
      message.success('已删除');
      setSelectedRowKeys([]);
      fetchRecords();
    } catch (e) {
      message.error('删除失败，请重试');
    }
  };

  const confirmBatchDelete = () => {
    Modal.confirm({
      title: `删除选中的 ${selectedRowKeys.length} 条押题记录？`,
      content: '删除后无法恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: handleBatchDelete,
    });
  };

  // 单个删除
  const handleDelete = async (id: number) => {
    try {
      await predictionService.deleteHistory([id]);
      message.success('已删除');
      fetchRecords();
    } catch (e) {
      message.error('删除失败，请重试');
    }
  };

  const columns: ColumnsType<PredictionRecordItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (text: any) => <span className="font-mono text-ink-secondary">#{text}</span>,
    },
    {
      title: '押题类型',
      dataIndex: 'prediction_type',
      key: 'prediction_type',
      render: (type: string) => <Tag className="m-0">{type || '-'}</Tag>,
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      render: (level: string) => <Tag className="m-0">{level || '-'}</Tag>,
    },
    {
      title: '目标公司',
      dataIndex: 'company',
      key: 'company',
      render: (text: string) => <span className="font-medium text-ink">{text || '-'}</span>,
    },
    {
      title: '岗位',
      dataIndex: 'job_title',
      key: 'job_title',
      render: (text: string) => <span className="text-ink">{text || '-'}</span>,
    },
    {
      title: '语言',
      dataIndex: 'language',
      key: 'language',
      render: (text: string) => <span className="text-ink-secondary">{text || '-'}</span>,
    },
    {
      title: '押题时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: string | number) => (
        <span className="text-sm tabular-nums text-ink-secondary">
          {formatCreatedAt(createdAt)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: PredictionRecordItem) => (
        <div className="flex items-center gap-1">
          <Link href={`/user/press/${record.id}`}>
            <Button type="link" size="small" className="px-1">
              查看
            </Button>
          </Link>
          <Popconfirm
            title="删除这条押题记录？"
            description="删除后无法恢复。"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button type="link" size="small" danger className="px-1">
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      item.company?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.job_title?.toLowerCase().includes(searchText.toLowerCase());
    return matchSearch;
  });

  const goPredict = (
    <Link href="/resume">
      <Button type="primary" icon={<Zap className="h-4 w-4" aria-hidden="true" />}>
        去押题
      </Button>
    </Link>
  );

  const renderBody = () => {
    // 首次加载用骨架屏，之后刷新沿用表格自带的加载状态
    if (!loaded) {
      return (
        <div className="p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="py-12">
          <Empty description="还没有押题记录，上传简历后生成第一份押题">{goPredict}</Empty>
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            allowClear
            placeholder="搜索公司或岗位"
            prefix={<Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full sm:w-72"
          />
          {selectedRowKeys.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-secondary">
                已选择 <span className="tabular-nums">{selectedRowKeys.length}</span> 项
              </span>
              <Button
                danger
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                onClick={confirmBatchDelete}
              >
                批量删除
              </Button>
            </div>
          )}
        </div>

        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          locale={{
            emptyText: <Empty description="没有匹配的记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => (
              <span className="text-ink-secondary">
                共 <span className="tabular-nums">{total}</span> 条
              </span>
            ),
            className: 'px-4',
          }}
        />
      </>
    );
  };

  return (
    <div className="page py-10">
      <PageHeader
        title="押题记录"
        description="查看历史押题，回顾预测的面试题和参考答案。"
        actions={
          <>
            <Button
              icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}
              onClick={fetchRecords}
              loading={loaded && loading}
            >
              刷新
            </Button>
            {goPredict}
          </>
        }
      />

      <div className="surface overflow-hidden">{renderBody()}</div>
    </div>
  );
}
