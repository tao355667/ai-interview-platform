'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Form, Select, Input, Button, message, Modal, Steps } from 'antd';
import { BookOpenText, FileSearch, History, Network, Zap } from 'lucide-react';
import apiClient from '@/services/api/client';
import { RESUME_API, PREDICTION_API } from '@/config/api';
import PageHeader from '@/components/common/PageHeader';
import GeneratingProgress from '@/components/prediction/GeneratingProgress';

interface Resume {
  id: number;
  file_name: string;
}

const FEATURES = [
  {
    title: '定位考点',
    desc: '逐条解析简历中的项目和技能，生成对应的问答清单。',
    icon: <FileSearch className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
  },
  {
    title: '梳理追问',
    desc: '结合岗位要求和项目经历，给出面试官可能的追问路径。',
    icon: <Network className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
  },
  {
    title: '对照学习',
    desc: '每道题附带考察重点、答题思路和参考答案。',
    icon: <BookOpenText className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />,
  },
];

export default function ResumePressPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [showNoResumeModal, setShowNoResumeModal] = useState(false);
  const router = useRouter();

  const resumeId = Form.useWatch('resume_id', form);
  const job = Form.useWatch('job', form);
  const companyName = Form.useWatch('company_name', form);

  const currentStep = loading ? 2 : !resumeId ? 0 : !job || !companyName ? 1 : 2;

  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const data: any = await apiClient.get(RESUME_API.LIST);
        if (data && data.resumes) {
          setResumes(data.resumes);
          if (data.resumes.length > 0) {
            // 优先选中默认简历，否则选第一份
            const defaultResume = data.resumes.find((r: any) => r.is_default) || data.resumes[0];
            form.setFieldsValue({ resume_id: defaultResume.id });
          } else {
            setShowNoResumeModal(true);
          }
        } else {
          setShowNoResumeModal(true);
        }
      } catch (e) {
        console.error('Failed to fetch resumes:', e);
      }
    };
    fetchResumes();
  }, [form]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        resume_id: values.resume_id,
        prediction_type: values.prediction_type,
        language: values.language,
        job_title: values.job,
        difficulty: values.level,
        company_name: values.company_name,
      };

      await apiClient.post(PREDICTION_API.START, payload, {
        timeout: 180000, // 3 分钟超时
      });
      message.success('押题已生成');
      router.push('/user/press');
    } catch (e: any) {
      message.error(e?.message || '提交失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page py-10">
      <PageHeader
        title="简历押题"
        description="根据你的简历和求职意向，预测面试中可能被问到的问题。"
        actions={
          <Link href="/user/press">
            <Button icon={<History className="h-4 w-4" aria-hidden="true" />}>押题记录</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="surface p-6 lg:col-span-2">
          <Steps
            size="small"
            current={currentStep}
            className="mb-8"
            items={[{ title: '选择简历' }, { title: '填写目标岗位' }, { title: '生成押题' }]}
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            disabled={loading}
            requiredMark={false}
            initialValues={{
              language: 'Java',
              job: 'Java 后端开发',
              level: '进阶',
              prediction_type: '校招',
            }}
          >
            <section>
              <h2 className="mb-4 text-base font-semibold text-ink">
                <span className="mr-2 tabular-nums text-brand-800">1</span>
                选择简历
              </h2>
              <Form.Item
                label="押题使用的简历"
                name="resume_id"
                rules={[{ required: true, message: '请选择简历' }]}
                extra={
                  <span>
                    没有合适的简历？
                    <Link
                      href="/user/center"
                      className="text-brand-800 underline-offset-2 hover:underline"
                    >
                      去个人中心上传
                    </Link>
                  </span>
                }
              >
                <Select
                  options={resumes.map((r) => ({ value: r.id, label: r.file_name }))}
                  placeholder={resumes.length === 0 ? '加载中...' : '请选择简历'}
                  popupMatchSelectWidth={false}
                />
              </Form.Item>
            </section>

            <section className="mt-2 border-t border-line pt-6">
              <h2 className="mb-4 text-base font-semibold text-ink">
                <span className="mr-2 tabular-nums text-brand-800">2</span>
                填写目标岗位
              </h2>
              <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <Form.Item
                  label="岗位意向"
                  name="job"
                  rules={[{ required: true, message: '请填写岗位意向，如：Java 后端开发' }]}
                >
                  <Input placeholder="如：Java 后端开发" />
                </Form.Item>

                <Form.Item
                  label="目标公司"
                  name="company_name"
                  rules={[{ required: true, message: '请填写目标公司，如：字节跳动' }]}
                >
                  <Input placeholder="如：字节跳动" />
                </Form.Item>

                <Form.Item
                  label="面试类型"
                  name="prediction_type"
                  rules={[{ required: true, message: '请选择面试类型' }]}
                >
                  <Select
                    options={[
                      { value: '校招', label: '校招' },
                      { value: '社招', label: '社招' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  label="编程语言"
                  name="language"
                  rules={[{ required: true, message: '请选择编程语言' }]}
                >
                  <Select
                    options={[
                      { value: 'Java', label: 'Java' },
                      { value: 'Golang', label: 'Golang' },
                      { value: 'Python', label: 'Python' },
                      { value: 'C++', label: 'C++' },
                      { value: 'Frontend', label: '前端（JS/TS）' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  label="难度等级"
                  name="level"
                  rules={[{ required: true, message: '请选择难度等级' }]}
                >
                  <Select
                    options={[
                      { value: '入门', label: '入门' },
                      { value: '中级', label: '中级' },
                      { value: '进阶', label: '进阶' },
                      { value: '专家', label: '专家' },
                    ]}
                  />
                </Form.Item>
              </div>
            </section>

            <section className="mt-2 border-t border-line pt-6">
              <h2 className="mb-4 text-base font-semibold text-ink">
                <span className="mr-2 tabular-nums text-brand-800">3</span>
                生成押题
              </h2>

              {loading ? (
                <GeneratingProgress active={loading} />
              ) : (
                <p className="mb-4 text-sm text-ink-secondary">
                  确认信息无误后开始生成，每次不少于 20 道题，约需 1 分钟。
                </p>
              )}

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                // 表单在生成时整体禁用，按钮单独保持可见的 loading 状态
                disabled={false}
                icon={<Zap className="h-4 w-4" aria-hidden="true" />}
                className={`w-full sm:w-auto ${loading ? 'mt-4' : ''}`}
              >
                {loading ? '正在生成' : '开始押题'}
              </Button>
            </section>
          </Form>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="surface p-5">
            <h3 className="mb-4 text-base font-semibold text-ink">押题能帮你做什么</h3>
            <ul className="flex flex-col gap-4">
              {FEATURES.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base text-brand-800">
                    {item.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-ink">{item.title}</div>
                    <p className="mt-0.5 text-sm leading-6 text-ink-secondary">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="surface p-5">
            <h3 className="mb-3 text-base font-semibold text-ink">使用提示</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-ink-secondary">
              <li>题目根据简历内容生成，每次至少 20 道。</li>
              <li>切换或更新简历会改变押题范围，历史押题会保留。</li>
              <li>岗位和公司写得越具体，题目越贴近真实面试。</li>
            </ul>
          </div>
        </aside>
      </div>

      <Modal
        open={showNoResumeModal}
        title="还没有简历"
        onCancel={() => setShowNoResumeModal(false)}
        centered
        footer={[
          <Button key="cancel" onClick={() => setShowNoResumeModal(false)}>
            稍后再说
          </Button>,
          <Button key="upload" type="primary" onClick={() => router.push('/user/center')}>
            去上传简历
          </Button>,
        ]}
      >
        <p className="text-sm leading-6 text-ink-secondary">
          押题需要基于简历生成。请先到个人中心上传简历，AI 会根据简历内容生成针对性的面试题。
        </p>
      </Modal>
    </div>
  );
}
