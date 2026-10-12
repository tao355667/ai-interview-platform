import { ArrowUp, Mic } from 'lucide-react';
import { Button } from 'antd';

interface InterviewFooterActionsProps {
  isRecording: boolean;
  isStopping: boolean;
  speechDisabled: boolean;
  asrLoading: boolean;
  submitting: boolean;
  sendDisabled: boolean;
  onMicClick: () => void;
  onSubmit: () => void;
  /** 输入框下方的状态提示，例如语音识别状态 */
  hint?: string;
  sendLabel?: string;
}

export function InterviewFooterActions({
  isRecording,
  isStopping,
  speechDisabled,
  asrLoading,
  submitting,
  sendDisabled,
  onMicClick,
  onSubmit,
  hint,
  sendLabel = '发送',
}: InterviewFooterActionsProps) {
  const recordingActive = isRecording || isStopping;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {recordingActive ? (
          <Button danger size="small" disabled={isStopping} onClick={onMicClick}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-danger animate-pulse" aria-hidden="true" />
              {/* 录音中的实时声波 */}
              {!isStopping && (
                <span className="flex h-3.5 items-center gap-[2px]" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="h-full w-[2px] origin-center animate-wave rounded-full bg-danger"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </span>
              )}
              {isStopping ? '正在停止…' : '停止录音'}
            </span>
          </Button>
        ) : (
          <Button
            type="text"
            size="small"
            aria-label="语音输入"
            icon={<Mic className="h-4 w-4" aria-hidden="true" />}
            disabled={speechDisabled || asrLoading}
            onClick={onMicClick}
          />
        )}
        {hint && <span className="truncate text-xs text-ink-secondary">{hint}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-ink-muted sm:inline">
          Enter 发送 · Shift+Enter 换行
        </span>
        <Button
          type="primary"
          icon={<ArrowUp className="h-4 w-4" aria-hidden="true" />}
          loading={submitting}
          disabled={sendDisabled}
          onClick={onSubmit}
        >
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}
