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
    { title: '基础能力', desc: '重视计算机基础，考察逻辑理解' },
    { title: '表达条理', desc: '按校招标准出题，看回答是否清晰有条理' },
    { title: '知识掌握', desc: '结合项目与课程经历，验证学习深度' },
    { title: '潜力与成长', desc: '通过解题过程判断学习能力和潜力' },
  ],
  duration: '约 30–60 分钟',
  tips: ['上传一份内容完整的简历，AI 能生成更有针对性的题目', ...COMMON_TIPS],
};

export default function CampusInterviewPage() {
  const [form] = Form.useForm();
  const resumeState = useResumeList();
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const ready = hasResumes(resumeState);
  const blocked = !ready && resumeState.status !== 'loading';

  const handleFinish = (values: any) => {
    const params = {
      type: 'comprehensive',
      domain: 'campus',
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
    router.push('/interview/campus/start');
  };

  return (
    <InterviewSetupLayout
      kind="campus"
      guide={GUIDE}
      submit={
        blocked
          ? undefined
          : {
              label: '开始面试',
              loading: starting,
              disabled: !ready || starting,
              hint: '围绕简历条目与技术基础自动追问',
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
