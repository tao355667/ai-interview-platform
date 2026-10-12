'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Select, message } from 'antd';
import InterviewSetupLayout, {
  SETUP_FORM_ID,
  type SetupGuide,
} from '@/components/interview/setup/InterviewSetupLayout';
import {
  COMMON_TIPS,
  ResumeGate,
  ResumeSelectField,
  VALIDATION_FAILED_MESSAGE,
  hasResumes,
  useResumeList,
} from '@/components/interview/setup/SetupFields';

const LEVEL_OPTIONS = [
  { value: 'simple', label: '初级' },
  { value: 'normal', label: '中高级' },
  { value: 'hard', label: '架构级' },
];

const GUIDE: SetupGuide = {
  focus: [
    { title: '主面试官', desc: '把控节奏，考察价值观与行为表现' },
    { title: '技术面试官', desc: '深入技术细节，探测能力边界' },
    { title: '项目面试官', desc: '复盘项目经历，考察落地与避坑能力' },
    { title: '多角色协作', desc: '多位面试官交替提问，还原真实群面压力' },
  ],
  duration: '约 30–60 分钟',
  tips: ['不同面试官侧重点不同，注意听清是谁在提问，再有针对性地回答', ...COMMON_TIPS],
};

export default function MultiAgentInterviewPage() {
  const [form] = Form.useForm();
  const resumeState = useResumeList();
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const ready = hasResumes(resumeState);
  const blocked = !ready && resumeState.status !== 'loading';

  const handleFinish = (values: any) => {
    const params = {
      type: 'multi-agent',
      domain: 'eino',
      difficulty: values.level,
      position_name: values.job || '',
      company_name: String(values.company_name || ''),
      resume_id: values.resume_id,
    };
    (window as any).__interviewParams = { ...params };
    try {
      sessionStorage.setItem('interviewParams', JSON.stringify(params));
    } catch {}
    setStarting(true);
    router.push('/interview/multi/start');
  };

  return (
    <InterviewSetupLayout
      kind="multi"
      formTitle="面试小组配置"
      guide={GUIDE}
      submit={
        blocked
          ? undefined
          : {
              label: '进入面试间',
              loading: starting,
              disabled: !ready || starting,
              hint: '模拟真实群面流程，多角色交叉考察',
            }
      }
    >
      <ResumeGate state={resumeState}>
        <Form
          id={SETUP_FORM_ID}
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{ job: '高级前端工程师', level: 'normal' }}
          onFinish={handleFinish}
          onFinishFailed={() => message.error(VALIDATION_FAILED_MESSAGE)}
        >
          <ResumeSelectField
            resumes={resumeState.resumes}
            loading={resumeState.status === 'loading'}
            disabled={starting}
            placeholder="选择简历，面试官会据此提问"
          />

          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item
              label="面试职位"
              name="job"
              rules={[{ required: true, message: '请输入面试职位' }]}
            >
              <Input placeholder="例如：高级前端工程师" />
            </Form.Item>

            <Form.Item
              label="难度等级"
              name="level"
              rules={[{ required: true, message: '请选择难度等级' }]}
            >
              <Select options={LEVEL_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item label="目标公司" name="company_name">
            <Input placeholder="例如：阿里巴巴、字节跳动" maxLength={100} />
          </Form.Item>
        </Form>
      </ResumeGate>
    </InterviewSetupLayout>
  );
}
