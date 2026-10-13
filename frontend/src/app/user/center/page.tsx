'use client';

import { FileText, Inbox, LoaderCircle, Trash2, Upload as UploadIcon } from 'lucide-react';
import { useEffect, useState, useCallback, useMemo } from 'react';

import type { UploadProps } from 'antd';
import { Avatar, Tag, Button, Upload, message, Popconfirm, Skeleton, Tooltip } from 'antd';
import apiClient from '@/services/api/client';
import { USER_API, RESUME_API } from '@/config/api';
import PageHeader from '@/components/common/PageHeader';

const { Dragger } = Upload;

const MAX_RESUMES = 3;

// 简历信息类型
interface ResumeInfo {
  id: number;
  user_id: number;
  file_name: string;
  file_size: number;
  file_type: string;
  is_default: number;
  created_at: number;
  updated_at: number;
  status?: string; // pending/processing/completed/failed
  error_msg?: string;
}

// 格式化文件大小
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 格式化时间
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

function ResumeStatusTag({ resume }: { resume: ResumeInfo }) {
  if (resume.status === 'pending') {
    return (
      <Tag color="processing" bordered={false} className="m-0">
        待解析
      </Tag>
    );
  }
  if (resume.status === 'processing') {
    return (
      <Tag
        color="processing"
        bordered={false}
        icon={
          <LoaderCircle
            className="mr-1 inline-block h-3 w-3 align-[-0.125em] animate-spin"
            aria-hidden="true"
          />
        }
        className="m-0"
      >
        解析中
      </Tag>
    );
  }
  if (resume.status === 'failed') {
    return (
      <Tooltip title={resume.error_msg || '解析失败'}>
        <Tag color="error" bordered={false} className="m-0">
          解析失败
        </Tag>
      </Tooltip>
    );
  }
  return null;
}

export default function UserCenterPage() {
  const [profile, setProfile] = useState<{ id?: number; username?: string; email?: string } | null>(
    null
  );
  const [profileLoading, setProfileLoading] = useState(true);

  const [resumes, setResumes] = useState<ResumeInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [resumesLoaded, setResumesLoaded] = useState(false);

  // 获取简历列表
  const fetchResumes = useCallback(async () => {
    setLoadingResumes(true);
    try {
      const data: any = await apiClient.get(RESUME_API.LIST);
      setResumes(data?.resumes || []);
    } catch (err) {
      console.error('获取简历列表失败:', err);
    } finally {
      setLoadingResumes(false);
      setResumesLoaded(true);
    }
  }, []);

  // 上传简历（异步处理）
  const handleUpload = async (file: File) => {
    if (resumes.length >= MAX_RESUMES) {
      message.warning('最多只能上传 3 份简历');
      return false;
    }

    const formData = new FormData();
    formData.append('resume', file);

    setUploading(true);
    try {
      const res: any = await apiClient.post(RESUME_API.UPLOAD, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000, // 异步模式，30秒就足够了
      });

      // 检查返回状态
      if (res?.status === 'pending' || res?.status === 'processing') {
        message.info('简历已上传，正在解析');
        // 开始轮询检查状态
        if (res?.resume_id) {
          pollResumeStatus(res.resume_id);
        }
      } else {
        message.success('简历上传成功');
      }
      fetchResumes();
    } catch (err: any) {
      message.error(err?.message || '简历上传失败');
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 轮询简历解析状态
  const pollResumeStatus = async (resumeId: number) => {
    const maxAttempts = 60; // 最多轮询 60 次 (约 5 分钟)
    const interval = 5000; // 每 5 秒轮询一次

    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const data: any = await apiClient.get(RESUME_API.DETAIL(resumeId));
        const resume = data?.resume;

        if (resume?.status === 'completed') {
          message.success('简历解析完成');
          fetchResumes();
          return;
        } else if (resume?.status === 'failed') {
          message.error(`简历解析失败：${resume?.error_msg || '未知错误'}`);
          fetchResumes();
          return;
        } else if (attempts < maxAttempts) {
          // 继续轮询
          setTimeout(poll, interval);
        } else {
          message.warning('简历解析超时，请稍后刷新页面查看');
          fetchResumes();
        }
      } catch (err) {
        console.error('轮询简历状态失败:', err);
        if (attempts < maxAttempts) {
          setTimeout(poll, interval);
        }
      }
    };

    // 延迟开始轮询，让后端有时间处理
    setTimeout(poll, 3000);
  };

  // 设置默认简历
  const handleSetDefault = async (resumeId: number) => {
    try {
      await apiClient.post(RESUME_API.SET_DEFAULT, { resume_id: resumeId });
      message.success('已设为默认简历');
      fetchResumes();
    } catch (err: any) {
      message.error(err?.message || '设置默认简历失败');
    }
  };

  // 删除简历
  const handleDelete = async (resumeId: number) => {
    try {
      await apiClient.delete(RESUME_API.DELETE(resumeId));
      message.success('简历已删除');
      fetchResumes();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  // 上传配置
  const uploadProps: UploadProps = {
    name: 'resume',
    accept: '.pdf',
    showUploadList: false,
    beforeUpload: handleUpload,
  };

  // 最新上传的简历视为默认简历
  const latestId = useMemo(
    () =>
      resumes.length > 0 ? resumes.reduce((a, b) => (a.created_at > b.created_at ? a : b)).id : -1,
    [resumes]
  );

  useEffect(() => {
    (async () => {
      try {
        const data: any = await apiClient.get(USER_API.GET_PROFILE);
        setProfile(data || null);
      } catch {
      } finally {
        setProfileLoading(false);
      }
    })();
    fetchResumes();
  }, [fetchResumes]);

  const displayName = profile?.username || '未登录';
  const canUpload = resumes.length < MAX_RESUMES;
  const showResumeSkeleton = loadingResumes && !resumesLoaded;

  return (
    <div className="page py-10">
      <PageHeader title="个人中心" description="管理你的个人信息和简历" />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
        {/* 个人信息 */}
        <aside className="surface p-5">
          {profileLoading ? (
            <Skeleton avatar active paragraph={{ rows: 2 }} />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Avatar
                  size={56}
                  className="shrink-0 bg-brand-50 text-xl font-semibold text-brand-800"
                >
                  {displayName.slice(0, 1).toUpperCase()}
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-ink">{displayName}</div>
                  <div className="truncate text-sm text-ink-secondary">
                    {profile?.email || '未绑定邮箱'}
                  </div>
                </div>
              </div>

              <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-secondary">用户名</dt>
                  <dd className="truncate text-ink">{profile?.username ?? '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-secondary">绑定邮箱</dt>
                  <dd className="truncate text-ink">{profile?.email ?? '-'}</dd>
                </div>
                {profile?.id !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">用户 ID</dt>
                    <dd className="font-mono text-ink tabular-nums">{profile.id}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </aside>

        {/* 我的简历 */}
        <section className="surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">我的简历</h2>
              <p className="mt-0.5 text-xs text-ink-secondary">
                已上传{' '}
                <span className="tabular-nums">
                  {resumes.length}/{MAX_RESUMES}
                </span>
                ，最新上传的简历将作为默认简历
              </p>
            </div>
            {canUpload && resumes.length > 0 && (
              <Upload {...uploadProps} disabled={uploading}>
                <Button
                  icon={<UploadIcon className="h-4 w-4" aria-hidden="true" />}
                  loading={uploading}
                >
                  上传简历
                </Button>
              </Upload>
            )}
          </div>

          <div className="p-5">
            {showResumeSkeleton ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : resumes.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {resumes.map((resume) => {
                  const isDefault = resume.id === latestId;
                  return (
                    <li
                      key={resume.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base text-brand-800">
                          <FileText className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span
                              className="truncate text-sm font-medium text-ink"
                              title={resume.file_name}
                            >
                              {resume.file_name}
                            </span>
                            {isDefault && (
                              <Tag bordered={false} className="m-0 bg-brand-50 text-brand-800">
                                默认
                              </Tag>
                            )}
                            <ResumeStatusTag resume={resume} />
                          </div>
                          <div className="mt-0.5 flex gap-2 text-xs text-ink-secondary tabular-nums">
                            <span>{formatFileSize(resume.file_size)}</span>
                            <span aria-hidden>·</span>
                            <span>{formatTime(resume.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                        {!isDefault && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => handleSetDefault(resume.id)}
                          >
                            设为默认
                          </Button>
                        )}
                        <Popconfirm
                          title="删除这份简历？"
                          description="删除后无法恢复"
                          onConfirm={() => handleDelete(resume.id)}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Dragger {...uploadProps} disabled={uploading}>
                <p className="ant-upload-drag-icon">
                  {uploading ? (
                    <LoaderCircle
                      className="inline-block text-brand-800 animate-spin"
                      size={48}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <Inbox
                      className="inline-block text-brand-800"
                      size={48}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                </p>
                <p className="ant-upload-text">
                  {uploading ? '正在上传…' : '还没有简历，点击或拖拽 PDF 文件到这里上传'}
                </p>
                <p className="ant-upload-hint">
                  支持 PDF 格式，最大 10MB。上传后可用于简历押题和模拟面试
                </p>
              </Dragger>
            )}

            {!canUpload && (
              <p className="mt-4 text-sm text-ink-secondary">
                最多只能上传 3 份简历，删除旧简历后可继续上传。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
