'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Modal, message } from 'antd';
import { ArrowDown, Code2, FolderKanban, Users } from 'lucide-react';
import { INTERVIEW_API } from '@/config/api';
import { INTERVIEW_TYPES } from '@/config/interviewTypes';
import type { InterviewKind } from '@/config/interviewTypes';
import { useASRCapability } from '@/hooks/useASRCapability';
import { useSpeechAnswerInput } from '@/hooks/useSpeechAnswerInput';
import { InterviewFooterActions } from '@/components/interview/InterviewFooterActions';
import {
  ConversationItem,
  RoleType,
  SSEStreamParser,
  detectRoleFromContent,
  getRoleConfig,
} from '@/types/message-schema';

/** 面试参数由配置页写入 window.__interviewParams / sessionStorage('interviewParams') */
export type InterviewParams = Record<string, any>;

export type StartRequest =
  | { body: Record<string, unknown> }
  | { error: string; redirectTo?: string };

export interface InterviewRoomConfig {
  kind: InterviewKind;
  title: string;
  /** 标题下方的说明，可根据参数生成（如专项面试显示所选技术栈） */
  subtitle: (params: InterviewParams | null) => string;
  /** 传给语音识别接口的面试类型 */
  speechType: string;
  /** 传给语音识别接口的领域 */
  speechDomain?: (params: InterviewParams) => string;
  /** 多人面试：显示面试官角色，并支持切换面试官 */
  multiAgent?: boolean;
  /** 校验参数并构造启动请求体 */
  buildRequest: (params: InterviewParams | null) => StartRequest;
  preparingText: string;
}

const TOTAL_QUESTIONS = 10;
/** 距离底部多少像素以内视为“停留在底部”，此时新消息自动滚动 */
const STICK_TO_BOTTOM_PX = 120;

const SWITCH_TARGETS = [
  {
    key: 'main',
    role: 'main_interviewer',
    icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    key: 'tech',
    role: 'tech_interviewer',
    icon: <Code2 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    key: 'project',
    role: 'project_interviewer',
    icon: <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />,
  },
] as const;

function readParams(): InterviewParams | null {
  const fromWindow = (window as any).__interviewParams;
  if (fromWindow) return fromWindow;
  try {
    return JSON.parse(sessionStorage.getItem('interviewParams') || 'null');
  } catch {
    return null;
  }
}

function formatClock(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function InterviewRoom({ config }: { config: InterviewRoomConfig }) {
  const router = useRouter();
  const meta = INTERVIEW_TYPES[config.kind];

  const [params, setParams] = useState<InterviewParams | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(true);
  const [waitingNextQuestion, setWaitingNextQuestion] = useState(false);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<ConversationItem[]>([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);

  // 当前问题文本：用于语音识别的上下文
  const questionText = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].type === 'question') return history[i].content;
    }
    return '';
  }, [history]);

  const asrCapability = useASRCapability();
  const speechInput = useSpeechAnswerInput({
    enabled: asrCapability.enabled,
    sessionId,
    interviewType: config.speechType,
    domain: params && config.speechDomain ? config.speechDomain(params) : undefined,
    questionText,
    onTranscript: (transcript) => {
      setAnswer((prev) => (prev.trim() ? `${prev.trim()}\n${transcript}` : transcript));
    },
  });

  const inputLocked = waitingNextQuestion || starting || finished;
  const speechDisabled =
    !asrCapability.enabled ||
    !sessionId ||
    inputLocked ||
    speechInput.isTranscribing ||
    speechInput.isStopping;
  const sendDisabled =
    !sessionId ||
    inputLocked ||
    speechInput.isRecording ||
    speechInput.isStopping ||
    speechInput.isTranscribing ||
    !answer.trim();

  const speechHint =
    !asrCapability.loading && !asrCapability.enabled
      ? '语音识别不可用，请使用文字作答'
      : speechInput.status === 'recording'
        ? '录音中，说完后点击“停止录音”'
        : speechInput.status === 'stopping'
          ? '正在停止录音…'
          : speechInput.status === 'transcribing'
            ? '正在识别语音…'
            : speechInput.status === 'error'
              ? '语音识别失败，请重试'
              : '支持语音作答，识别结果会填入输入框';

  const placeholder =
    speechInput.status === 'recording'
      ? '录音中…'
      : speechInput.status === 'stopping'
        ? '正在停止录音…'
        : speechInput.status === 'transcribing'
          ? '正在识别语音…'
          : starting
            ? '面试官正在准备问题…'
            : waitingNextQuestion
              ? '面试官正在思考下一题…'
              : '输入你的回答';

  // 计时
  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [finished]);

  // 启动面试并持续读取 SSE 流
  useEffect(() => {
    const p = readParams();
    setParams(p);
    const request = config.buildRequest(p);
    if ('error' in request) {
      message.error(request.error);
      setStarting(false);
      if (request.redirectTo) router.push(request.redirectTo);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const upsertQuestion = (payloadType: string, content: string, idx: number, role?: RoleType) => {
      setHistory((prev) => {
        let lastQuestionIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === 'question') {
            lastQuestionIdx = i;
            break;
          }
        }
        const roleFields = role ? { role, roleConfig: getRoleConfig(role) } : {};

        // 同一题：chunk 追加，question / follow_up_question 整体校准
        if (lastQuestionIdx !== -1 && prev[lastQuestionIdx].index === idx) {
          const updated = [...prev];
          const last = updated[lastQuestionIdx];
          updated[lastQuestionIdx] = {
            ...last,
            ...roleFields,
            content: payloadType === 'chunk' ? last.content + content : content,
          };
          return updated;
        }

        if (!content) return prev;
        return [
          ...prev,
          { type: 'question', content, index: idx, timestamp: Date.now(), ...roleFields },
        ];
      });
    };

    const handleEvent = (payload: any) => {
      const type = payload?.type;

      if (type === 'session_id' || type === 'start') {
        const sid = payload.session_id || payload.data?.session_id || '';
        if (sid) setSessionId(sid);
        return;
      }

      if (type === 'structured_message') {
        const role: RoleType = payload.role || 'main_interviewer';
        const content = payload.content || '';
        const idx = payload.index || 1;
        setStarting(false);
        setWaitingNextQuestion(false);
        setQuestionIndex(idx);
        if (payload.action_type === 'thinking') return;

        setHistory((prev) => {
          const lastIdx = prev.length - 1;
          // 同一角色连续发言：流式追加或整体替换
          if (lastIdx >= 0 && prev[lastIdx].type === 'question' && prev[lastIdx].role === role) {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              content:
                payload.status === 'streaming' ? updated[lastIdx].content + content : content,
            };
            return updated;
          }
          if (!content) return prev;
          return [
            ...prev,
            {
              type: 'question',
              content,
              role,
              roleConfig: getRoleConfig(role),
              index: idx,
              timestamp: Date.now(),
              actionType: payload.action_type || 'speaking',
            },
          ];
        });
        return;
      }

      if (type === 'chunk' || type === 'question' || type === 'follow_up_question') {
        const content = payload.content || payload.data?.question_text || '';
        const idx = payload.index || payload.data?.index || 1;
        let role: RoleType | undefined;
        if (config.multiAgent) {
          role = payload.role || (content ? detectRoleFromContent(content) : 'main_interviewer');
        }
        setStarting(false);
        setWaitingNextQuestion(false);
        setQuestionIndex(idx);
        upsertQuestion(type, content, idx, role);
        return;
      }

      if (type === 'thinking') {
        setWaitingNextQuestion(true);
        return;
      }

      if (type === 'ready_for_answer') {
        setWaitingNextQuestion(false);
        setStarting(false);
        return;
      }

      if (type === 'end' || type === 'complete') {
        setFinished(true);
        setStarting(false);
        setWaitingNextQuestion(false);
        message.success('面试已完成，正在跳转到面试记录…');
        setTimeout(() => router.push('/user/interviews'), 1500);
      }
    };

    const startInterview = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        message.error('请先登录后再开始面试');
        setStarting(false);
        return;
      }

      // 先确认后端可达，给出明确的错误提示
      try {
        await fetch(INTERVIEW_API.START_STREAM, { method: 'OPTIONS', mode: 'cors' });
      } catch {
        message.error('无法连接面试服务，请确认后端服务已启动');
        setStarting(false);
        return;
      }

      try {
        const init: RequestInit = {
          method: 'POST',
          body: JSON.stringify(request.body),
          signal: abortController.signal,
          mode: 'cors',
        };
        let response: Response;
        try {
          response = await fetch(INTERVIEW_API.START_STREAM, {
            ...init,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
        } catch (headerError: any) {
          if (headerError?.name === 'AbortError') throw headerError;
          // 带 Authorization 头的请求失败时，改用 URL 参数传递 token
          response = await fetch(
            `${INTERVIEW_API.START_STREAM}?token=${encodeURIComponent(token)}`,
            { ...init, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (!response.ok) {
          if (response.status === 401) message.error('登录已过期，请重新登录');
          else if (response.status === 404) message.error('面试接口不存在（404），请检查后端路由');
          else message.error(`面试启动失败：${response.status} ${response.statusText}`);
          setStarting(false);
          return;
        }
        if (!response.body) {
          message.error('无法读取面试数据流');
          setStarting(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEStreamParser();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const payload of parser.parse(decoder.decode(value, { stream: true }))) {
            handleEvent(payload);
          }
        }
        setStarting(false);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          message.error('面试连接中断，请检查网络后重试');
          console.error('[面试] 启动或读取流失败:', error);
        }
        setStarting(false);
      }
    };

    startInterview();

    return () => {
      abortController.abort();
      abortControllerRef.current = null;
    };
    // 只在进入页面时启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 只有停留在底部时才自动滚动，否则显示“回到最新”
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      setShowJumpToLatest(true);
    }
  }, [history, waitingNextQuestion, starting]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToLatest(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // 输入框解锁时自动聚焦
  useEffect(() => {
    if (!inputLocked) answerInputRef.current?.focus();
  }, [inputLocked]);

  // 面试进行中刷新或关闭页面时提醒
  useEffect(() => {
    if (!sessionId || finished) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sessionId, finished]);

  const sendAnswer = async (content: string, failMessage: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      message.error('登录已过期，请重新登录');
      return;
    }

    setSubmitting(true);
    stickToBottomRef.current = true;
    setHistory((prev) => [...prev, { type: 'answer', content, timestamp: Date.now() }]);
    setAnswer('');
    setWaitingNextQuestion(true);

    try {
      const res = await fetch(INTERVIEW_API.SUBMIT_ANSWER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, answer: content }),
        mode: 'cors',
      });
      if (!res.ok) {
        console.error('[提交答案] 错误响应:', await res.text());
        message.error(failMessage);
        setWaitingNextQuestion(false);
      }
      // 提交成功后由 SSE 流推送下一题
    } catch (error) {
      console.error('[提交答案] 异常:', error);
      message.error(`${failMessage}：网络错误`);
      setWaitingNextQuestion(false);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    if (submitting) return;
    if (!sessionId) {
      message.warning('面试会话已失效，请重新开始面试');
      return;
    }
    if (!answer.trim()) {
      message.warning('请先输入回答');
      return;
    }
    sendAnswer(answer, '回答提交失败，请重试');
  };

  // 多人面试：请指定面试官接着聊当前回答
  const switchInterviewer = (role: RoleType) => {
    if (!sessionId || !answer.trim() || submitting) return;
    const name = getRoleConfig(role).roleName;
    sendAnswer(`我想请${name}来聊聊这个问题：${answer}`, '切换面试官失败');
  };

  const endInterview = async () => {
    if (sessionId) {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await fetch(INTERVIEW_API.END_INTERVIEW, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ session_id: sessionId }),
            mode: 'cors',
          });
        }
      } catch (e) {
        console.error('[结束面试] 请求失败:', e);
      }
    }
    try {
      abortControllerRef.current?.abort();
    } catch {}
    setFinished(true);
    message.success('面试已结束，正在跳转…');
    router.push('/user/interviews');
  };

  const confirmEnd = () => {
    if (!sessionId) {
      router.push('/user/interviews');
      return;
    }
    Modal.confirm({
      title: '结束本次面试？',
      content: '结束后将根据已作答的题目生成评估报告，未作答的题目不计分。',
      okText: '结束面试',
      okButtonProps: { danger: true },
      cancelText: '继续作答',
      onOk: endInterview,
    });
  };

  const percent = Math.min(100, Math.round((questionIndex / TOTAL_QUESTIONS) * 100));
  const interviewerLabel = config.multiAgent ? '面试小组' : '面试官';

  let questionSeq = 0;

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col bg-canvas">
      {/* 顶部状态栏 */}
      <header className="shrink-0 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${meta.toneClass}`}
            >
              {meta.icon}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-ink">{config.title}</h1>
              <p className="truncate text-xs text-ink-secondary">{config.subtitle(params)}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="hidden items-center gap-3 text-xs text-ink-secondary sm:flex">
              <span className="tabular-nums" aria-label="已用时间">
                {formatClock(elapsed)}
              </span>
              <span className="h-3 w-px bg-line" aria-hidden="true" />
              <span className="tabular-nums">
                {questionIndex > 0
                  ? `第 ${Math.min(questionIndex, TOTAL_QUESTIONS)} / ${TOTAL_QUESTIONS} 题`
                  : '准备中'}
              </span>
              <span
                className="h-1.5 w-20 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="block h-full bg-brand-600 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </span>
            </div>
            <Button danger size="small" onClick={confirmEnd} disabled={finished}>
              结束面试
            </Button>
          </div>
        </div>
      </header>

      {/* 对话区 */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6" aria-live="polite">
            {history.length === 0 && !starting && (
              <div className="py-16 text-center text-sm text-ink-secondary">
                还没有收到问题。如果长时间没有响应，请返回配置页重新开始。
              </div>
            )}

            {history.map((item, index) => {
              if (item.type === 'answer') {
                return (
                  <div key={index} className="flex flex-col items-end">
                    <div className="mb-1 text-xs text-ink-secondary">
                      我 ·{' '}
                      {new Date(item.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-card rounded-tr-md bg-brand-50 px-4 py-3 text-[15px] leading-7 text-ink">
                      {item.content}
                    </div>
                  </div>
                );
              }

              questionSeq += 1;
              const roleConfig = config.multiAgent
                ? item.roleConfig || getRoleConfig(item.role || detectRoleFromContent(item.content))
                : null;

              return (
                <div key={index} className="flex flex-col items-start">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-secondary">
                    <span className={roleConfig ? `font-medium ${roleConfig.colorClass}` : ''}>
                      {roleConfig ? roleConfig.roleName : '面试官'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">第 {questionSeq} 题</span>
                  </div>
                  <div
                    className={`max-w-[90%] whitespace-pre-wrap break-words rounded-card rounded-tl-md border bg-white px-4 py-3 shadow-xs text-[15px] leading-7 text-ink ${
                      roleConfig ? roleConfig.borderClass : 'border-line'
                    }`}
                  >
                    {item.content}
                  </div>
                </div>
              );
            })}

            {(starting || waitingNextQuestion) && (
              <div className="flex flex-col items-start">
                <div className="mb-1 text-xs text-ink-secondary">{interviewerLabel}</div>
                <div className="flex items-center gap-2.5 rounded-card rounded-tl-md border border-line bg-white px-4 py-3 text-sm text-ink-secondary shadow-xs">
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-dot rounded-full bg-brand-600"
                        style={{ animationDelay: `${d * 0.16}s` }}
                      />
                    ))}
                  </span>
                  {starting ? config.preparingText : `${interviewerLabel}正在思考下一题…`}
                </div>
              </div>
            )}
          </div>
        </div>

        {showJumpToLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink shadow-pop hover:border-brand-200"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            回到最新
          </button>
        )}
      </div>

      {/* 输入区 */}
      <footer className="shrink-0 border-t border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {config.multiAgent && sessionId && !inputLocked && answer.trim() && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-secondary">请指定面试官回应：</span>
              {SWITCH_TARGETS.map((t) => (
                <Button
                  key={t.key}
                  size="small"
                  icon={t.icon}
                  disabled={submitting}
                  onClick={() => switchInterviewer(t.role)}
                >
                  {getRoleConfig(t.role).roleName}
                </Button>
              ))}
            </div>
          )}

          <div className="rounded-card border border-line-strong bg-white shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-brand-600 focus-within:shadow-[0_0_0_4px_rgba(16,187,131,0.12)]">
            <Input.TextArea
              ref={answerInputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={placeholder}
              aria-label="你的回答"
              disabled={inputLocked}
              readOnly={speechInput.isRecording || speechInput.isStopping}
              autoSize={{ minRows: 2, maxRows: 8 }}
              variant="borderless"
              className="px-4 py-3 text-[15px] leading-7"
              onKeyDown={(e) => {
                // 中文输入法选词时按 Enter 不发送
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!sendDisabled) onSubmit();
                }
              }}
            />
            <InterviewFooterActions
              isRecording={speechInput.isRecording}
              isStopping={speechInput.isStopping}
              speechDisabled={speechDisabled}
              asrLoading={asrCapability.loading}
              submitting={submitting}
              sendDisabled={sendDisabled}
              onMicClick={speechInput.handleMicClick}
              onSubmit={onSubmit}
              hint={speechHint}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
