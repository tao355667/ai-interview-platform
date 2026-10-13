/**
 * 首屏演示用的模拟对话：一道开场题、一段示例回答，以及按关键词挑选的追问。
 * 不接真实 AI 服务。
 */

export const OPENING_QUESTION = '讲讲你在项目里是怎么做接口限流的？';

export const SAMPLE_ANSWER =
  '我们用 Redis 加 Lua 脚本实现了令牌桶，按用户维度限流，高峰期大概每秒两千次请求。';

const RULES: { test: RegExp; ask: string }[] = [
  { test: /redis/i, ask: '如果 Redis 挂了，你的限流会放行所有请求，还是全部拒绝？' },
  { test: /令牌|token/i, ask: '令牌桶的容量和速率是怎么定的？有没有压测过突发流量？' },
  { test: /滑动|窗口|window/i, ask: '滑动窗口在集群里怎么保证计数一致？' },
  { test: /nginx|网关|gateway/i, ask: '网关层限流之后，服务内部还需要再限一次吗？为什么？' },
];

export function pickFollowUp(answer: string): string {
  const text = answer.trim();
  if (text.length < 12) return '能再具体一点吗？比如当时的 QPS 大概是多少？';
  return RULES.find((r) => r.test.test(text))?.ask ?? '这个方案上线后，你是怎么确认它真的生效的？';
}

/** 一个字发一次声；标点停顿更久。返回每个字相对开始的时间（秒）和音量 */
export function syllablesOf(text: string): { at: number; amp: number }[] {
  const out: { at: number; amp: number }[] = [];
  let at = 0;
  for (const ch of text) {
    if (/[，。？！、,.?!；;：:]/.test(ch)) {
      at += 0.26;
      out.push({ at, amp: 0 });
      continue;
    }
    // 英文单词里的字母说得快，中文字一字一拍
    const latin = /[A-Za-z0-9 ]/.test(ch);
    at += latin ? 0.05 : 0.12;
    out.push({ at, amp: latin ? 0.35 : 0.55 + ((ch.charCodeAt(0) * 37) % 45) / 100 });
  }
  return out;
}
