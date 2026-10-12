'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Select, message } from 'antd';
import InterviewSetupLayout, {
  SETUP_FORM_ID,
  type SetupGuide,
} from '@/components/interview/setup/InterviewSetupLayout';
import {
  COMMON_TIPS,
  DIFFICULTY_OPTIONS,
  VALIDATION_FAILED_MESSAGE,
} from '@/components/interview/setup/SetupFields';

const STACK_GROUPS = [
  {
    label: '编程语言',
    options: [
      { value: 'Java', label: 'Java' },
      { value: 'Go', label: 'Go' },
      { value: 'C/C++', label: 'C/C++' },
      { value: 'Rust', label: 'Rust' },
      { value: 'PHP', label: 'PHP' },
      { value: 'Node.js', label: 'Node.js' },
    ],
  },
  {
    label: '后端组件',
    options: [
      { value: 'Redis', label: 'Redis' },
      { value: 'MySQL', label: 'MySQL' },
      { value: 'Kafka', label: 'Kafka' },
      { value: 'MongoDB', label: 'MongoDB' },
    ],
  },
  {
    label: '云原生与运维',
    options: [
      { value: 'Docker', label: 'Docker' },
      { value: 'Kubernetes', label: 'Kubernetes' },
      { value: 'Nginx', label: 'Nginx' },
    ],
  },
  {
    label: '计算机基础',
    options: [
      { value: 'os', label: '操作系统' },
      { value: 'network', label: '计算机网络' },
      { value: 'dsa', label: '数据结构与算法' },
    ],
  },
];

const STACK_LABELS: Record<string, string> = Object.fromEntries(
  STACK_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label]))
);

const GUIDE: SetupGuide = {
  focus: [
    { title: '精准拆解', desc: '直击该方向的核心高频考点' },
    { title: '链路梳理', desc: '串联知识点，形成系统化的知识图谱' },
    { title: '高密度追问', desc: '连续追问，快速定位能力边界' },
    { title: '实战模拟', desc: '还原真实面试的节奏与压力' },
  ],
  duration: '约 30–60 分钟',
  tips: ['适合在综合面试前单点突破，或在复习阶段查漏补缺', ...COMMON_TIPS],
};

export default function SpecialInterviewPage() {
  const [form] = Form.useForm();
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const stack: string | undefined = Form.useWatch('stack', form);

  const handleFinish = (values: any) => {
    setStarting(true);

    const params = {
      type: 'special',
      domain: values.stack,
      difficulty: values.level,
    };

    (window as any).__interviewParams = { ...params };
    try {
      sessionStorage.setItem('interviewParams', JSON.stringify(params));
    } catch {}

    router.push('/interview/special/start');
  };

  return (
    <InterviewSetupLayout
      kind="special"
      guide={GUIDE}
      submit={{
        label: '开始专项训练',
        loading: starting,
        disabled: starting,
        hint: stack ? `当前方向：${STACK_LABELS[stack] ?? stack}` : undefined,
      }}
    >
      <Form
        id={SETUP_FORM_ID}
        form={form}
        layout="vertical"
        initialValues={{ stack: 'Go', level: 'simple' }}
        onFinish={handleFinish}
        onFinishFailed={() => message.error(VALIDATION_FAILED_MESSAGE)}
      >
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <Form.Item
            label="专项方向"
            name="stack"
            rules={[{ required: true, message: '请选择专项方向' }]}
          >
            <Select options={STACK_GROUPS} placeholder="请选择技术栈" disabled={starting} />
          </Form.Item>

          <Form.Item
            label="难度等级"
            name="level"
            rules={[{ required: true, message: '请选择难度等级' }]}
          >
            <Select options={DIFFICULTY_OPTIONS} disabled={starting} />
          </Form.Item>
        </div>
      </Form>
    </InterviewSetupLayout>
  );
}
