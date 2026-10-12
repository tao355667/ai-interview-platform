'use client';

import { useState } from 'react';
import { Button, Card, Descriptions, Tag, message } from 'antd';
import { CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { INTERVIEW_API } from '@/config/api';

interface HealthCheckResult {
  backendReachable: boolean;
  loginEndpoint: boolean;
  interviewEndpoint: boolean;
  corsSupport: boolean;
  error?: string;
}

export default function BackendHealthCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);

  const checkBackend = async () => {
    setChecking(true);
    const checkResult: HealthCheckResult = {
      backendReachable: false,
      loginEndpoint: false,
      interviewEndpoint: false,
      corsSupport: false,
    };

    try {
      // 1. 检查后端服务是否可达
      console.log('[诊断] 检查后端服务...');
      const baseResponse = await fetch(`${INTERVIEW_API.START_STREAM}`, {
        method: 'OPTIONS',
        mode: 'cors',
      });
      checkResult.backendReachable = true;
      checkResult.loginEndpoint = baseResponse.status < 500;

      // 2. 检查CORS支持
      const corsHeader = baseResponse.headers.get('Access-Control-Allow-Origin');
      checkResult.corsSupport = !!corsHeader;
      console.log('[诊断] CORS头:', corsHeader);

      // 3. 检查面试接口
      console.log('[诊断] 检查面试接口...');
      try {
        const token = localStorage.getItem('token');
        const interviewResponse = await fetch(`${INTERVIEW_API.START_STREAM}`, {
          method: 'OPTIONS',
          mode: 'cors',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        checkResult.interviewEndpoint = interviewResponse.status !== 404;
        console.log('[诊断] 面试接口状态:', interviewResponse.status);
      } catch (e) {
        console.log('[诊断] 面试接口检查失败:', e);
        checkResult.interviewEndpoint = false;
      }

      setResult(checkResult);

      if (!checkResult.interviewEndpoint) {
        message.warning('面试接口返回 404，请检查后端路由配置');
      } else if (!checkResult.corsSupport) {
        message.warning('后端 CORS 配置可能有问题');
      } else {
        message.success('后端服务检查通过');
      }
    } catch (error: any) {
      console.error('[诊断] 检查失败:', error);
      checkResult.error = error.message || '网络错误';
      setResult(checkResult);
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
      message.error(`无法连接到后端服务，请确认后端是否运行在 ${apiUrl}`);
    } finally {
      setChecking(false);
    }
  };

  const StatusTag = ({ status }: { status: boolean }) => {
    return status ? (
      <Tag
        icon={
          <CircleCheck className="mr-1 inline-block h-3 w-3 align-[-0.125em]" aria-hidden="true" />
        }
        color="success"
      >
        正常
      </Tag>
    ) : (
      <Tag
        icon={<CircleX className="mr-1 inline-block h-3 w-3 align-[-0.125em]" aria-hidden="true" />}
        color="error"
      >
        异常
      </Tag>
    );
  };

  return (
    <Card
      title="后端服务诊断"
      className="rounded-card"
      extra={
        <Button
          type="primary"
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          loading={checking}
          onClick={checkBackend}
        >
          检查后端服务
        </Button>
      }
    >
      {!result && <p className="text-sm text-ink-secondary">点击“检查后端服务”开始诊断。</p>}

      {result && (
        <Descriptions column={1} bordered>
          <Descriptions.Item label="面试接口">
            <StatusTag status={result.interviewEndpoint} />
            {!result.interviewEndpoint && (
              <div className="mt-2 text-sm text-warning">
                <p>面试接口返回 404，可能的原因：</p>
                <ul className="ml-5 mt-1 list-disc space-y-1">
                  <li>后端路由未正确注册</li>
                  <li>需要将 /api/mianshi/stream/start 添加到公共路由列表</li>
                  <li>JWT 中间件拦截了请求</li>
                </ul>
              </div>
            )}
          </Descriptions.Item>

          <Descriptions.Item label="CORS 支持">
            <StatusTag status={result.corsSupport} />
            {!result.corsSupport && (
              <span className="ml-2 text-sm text-warning">后端可能缺少 CORS 配置</span>
            )}
          </Descriptions.Item>

          {result.error && (
            <Descriptions.Item label="错误信息">
              <span className="text-danger">{result.error}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      )}

      {result && !result.interviewEndpoint && (
        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm text-ink">
          <p className="mb-2 font-medium">解决方案</p>
          <p className="text-ink-secondary">
            请在后端的 <code>middleware.go</code> 文件中，将以下路径添加到{' '}
            <code>jwtPublicRoutes</code>：
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-white p-3 font-mono text-xs leading-5">
            {`"/api/mianshi/stream/start": {},
"/api/mianshi/answer/submit": {},
"/api/mianshi/interview/end": {},`}
          </pre>
        </div>
      )}
    </Card>
  );
}
