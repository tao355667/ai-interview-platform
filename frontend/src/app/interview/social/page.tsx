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
  DIFFICULTY_OPTIONS,
  ResumeGate,
  ResumeSelectField,
  VALIDATION_FAILED_MESSAGE,
  hasResumes,
  useResumeList,
} from '@/components/interview/setup/SetupFields';

const GUIDE: SetupGuide = {
  focus: [
    { title: '技术本质', desc: '深挖底层原理，围绕回答连续追问' },
    { title: '设计与决策', desc: '结合项目难点，考察架构设计能力' },
    { title: '沟通与表达', desc: '从被动回答到主动展示项目价值' },
    { title: '职级定位', desc: '对标大厂职级体系评估当前水平' },
  ],
  duration: '约 30–60 分钟',
  tips: [
    '简历中写清项目难点与解决方案，追问会更有针对性',
    '社招模式包含更深入的架构设计与场景题追问',
    ...COMMON_TIPS,
  ],
};

export default function SocialInterviewPage() {
  const [form] = Form.useForm();
  const resumeState = useResumeList();
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const ready = hasResumes(resumeState);
  const blocked = !ready && resumeState.status !== 'loading';

  const handleFinish = (values: any) => {
    const params = {
      type: 'comprehensive',
      domain: 'experienced',
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
    router.push('/interview/social/start');
  };

  return (
    <InterviewSetupLayout
      kind="social"
      guide={GUIDE}
      submit={
        blocked
          ? undefined
          : {
              label: '开始面试',
              loading: starting,
              disabled: !ready || starting,
              hint: '将根据简历内容出题并连续追问',
            }
      }
    >
      <ResumeGate state={resumeState}>
        <Form
          id={SETUP_FORM_ID}
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{ job: 'Java 后端开发', level: 'simple' }}
          onFinish={handleFinish}
          onFinishFailed={() => message.error(VALIDATION_FAILED_MESSAGE)}
        >
          <ResumeSelectField
            resumes={resumeState.resumes}
            loading={resumeState.status === 'loading'}
            disabled={starting}
          />

          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item label="岗位意向" name="job">
              <Input placeholder="例如：Java 后端开发" />
            </Form.Item>

            <Form.Item
              label="难度等级"
              name="level"
              rules={[{ required: true, message: '请选择难度等级' }]}
            >
              <Select options={DIFFICULTY_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item label="目标公司" name="company_name">
            <Input placeholder="例如：字节跳动" maxLength={100} />
          </Form.Item>
        </Form>
      </ResumeGate>
    </InterviewSetupLayout>
  );
}
