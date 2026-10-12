'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Empty, Form, Select, Skeleton } from 'antd';
import { File } from 'lucide-react';
import apiClient from '@/services/api/client';

export interface ResumeInfo {
  id: number;
  file_name: string;
}

export type ResumeListStatus = 'loading' | 'ready' | 'error';

export interface ResumeListState {
  resumes: ResumeInfo[];
  status: ResumeListStatus;
  reload: () => void;
}

/** 获取当前用户的简历列表（GET /resume/list） */
export function useResumeList(): ResumeListState {
  const [resumes, setResumes] = useState<ResumeInfo[]>([]);
  const [status, setStatus] = useState<ResumeListStatus>('loading');

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const data: any = await apiClient.get('/resume/list');
      setResumes(data?.resumes || []);
      setStatus('ready');
    } catch (err) {
      console.error('获取简历列表失败:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { resumes, status, reload };
}

/** 简历是否已就绪，可以展示表单 */
export function hasResumes(state: ResumeListState) {
  return state.status === 'ready' && state.resumes.length > 0;
}

/** 根据简历加载状态决定是否显示表单：加载中显示骨架，失败可重试，无简历时引导上传 */
export function ResumeGate({ state, children }: { state: ResumeListState; children: ReactNode }) {
  const router = useRouter();

  if (state.status === 'loading' && state.resumes.length === 0) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (state.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="简历列表加载失败"
        description="请检查网络后重试"
        action={
          <Button size="small" onClick={state.reload}>
            重试
          </Button>
        }
      />
    );
  }

  if (state.resumes.length === 0) {
    return (
      <Empty
        className="py-8"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="space-y-1">
            <div className="text-sm text-ink">还没有上传简历</div>
            <div className="text-sm text-ink-secondary">
              该面试会根据简历内容出题，请先在个人中心上传简历
            </div>
          </div>
        }
      >
        <div className="flex justify-center gap-2">
          <Button type="primary" onClick={() => router.push('/user/center')}>
            上传简历
          </Button>
          <Button onClick={state.reload}>刷新列表</Button>
        </div>
      </Empty>
    );
  }

  return <>{children}</>;
}

interface ResumeSelectFieldProps {
  resumes: ResumeInfo[];
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  requiredMessage?: string;
}

/** 表单中的“选择简历”字段，字段名固定为 resume_id */
export function ResumeSelectField({
  resumes,
  loading,
  disabled,
  label = '选择简历',
  placeholder = '请选择已上传的简历',
  requiredMessage = '请选择简历',
}: ResumeSelectFieldProps) {
  return (
    <Form.Item
      label={label}
      name="resume_id"
      rules={[{ required: true, message: requiredMessage }]}
    >
      <Select
        placeholder={placeholder}
        loading={loading}
        disabled={disabled}
        options={resumes.map((r) => ({
          value: r.id,
          label: (
            <span className="flex items-center gap-2">
              <File className="h-[1em] w-[1em] shrink-0 text-ink-secondary" aria-hidden="true" />
              <span>{r.file_name}</span>
            </span>
          ),
        }))}
      />
    </Form.Item>
  );
}

export const DIFFICULTY_OPTIONS = [
  { value: 'simple', label: '简单' },
  { value: 'normal', label: '中等' },
  { value: 'hard', label: '困难' },
];

/** 各类面试通用的注意事项 */
export const COMMON_TIPS = [
  '建议在安静的环境中进行，并允许浏览器使用麦克风',
  '可以使用语音作答，也可以直接输入文字',
  '回答时先说结论再展开，遇到不会的问题可以说明思路',
];

/** 表单校验失败时的统一提示 */
export const VALIDATION_FAILED_MESSAGE = '请先完善面试配置';
