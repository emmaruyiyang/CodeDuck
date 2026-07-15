export enum DuckState {
  Idle = "idle",
  Running = "running",
  WaitingInput = "waitingInput",
  Resolved = "resolved",
  Done = "done",
}

export interface HookPayload {
  type: string;
  [key: string]: any;
}

// 工具从 PreToolUse 到 PostToolUse 超过这么久还没结束，判定为“卡在等你批准权限” → 拉屎
const PENDING_TOOL_MS = 2000;

export class DuckStateMachine {
  private currentState: DuckState = DuckState.Idle;
  private listeners: ((state: DuckState, data?: any) => void)[] = [];
  private resolvedTimeout: NodeJS.Timeout | null = null;
  private pendingToolTimer: NodeJS.Timeout | null = null;
  private waitingStartTime: number = 0;

  constructor() {
    console.log("[QuackCode] State Machine initialized. Initial state:", DuckState.Idle);
  }

  // 普通工具 PreToolUse 后启动计时；迟迟不结束视为在等你批准权限 → 进入等待（拉屎）
  private armPendingWait() {
    this.clearPendingWait();
    this.pendingToolTimer = setTimeout(() => {
      this.pendingToolTimer = null;
      if (this.currentState === DuckState.Running) {
        this.waitingStartTime = Date.now();
        this.setState(DuckState.WaitingInput, { source: "permission-wait" });
      }
    }, PENDING_TOOL_MS);
  }

  private clearPendingWait() {
    if (this.pendingToolTimer) {
      clearTimeout(this.pendingToolTimer);
      this.pendingToolTimer = null;
    }
  }

  onStateChange(callback: (state: DuckState, data?: any) => void) {
    this.listeners.push(callback);
  }

  private setState(newState: DuckState, data?: any) {
    if (this.currentState !== newState) {
      console.log(`[QuackCode] State transition: ${this.currentState} → ${newState}`, data || "");
      this.currentState = newState;
      this.listeners.forEach((cb) => cb(newState, data));
    }
  }

  handleHookEvent(hookType: string, payload: HookPayload) {
    console.log(`[QuackCode] Hook event: ${hookType}`, payload);

    switch (hookType) {
      case "UserPromptSubmit":
        // 用户提交 prompt，从 Idle 或 Done 转 Running
        if (this.currentState === DuckState.Idle || this.currentState === DuckState.Done) {
          this.setState(DuckState.Running, { source: "UserPromptSubmit" });
        }
        break;

      case "PreToolUse":
        this.clearPendingWait();
        if (this.isWaitingTool(payload.tool_name)) {
          // 交互式工具（如 AskUserQuestion）= Claude 开始等用户回答 → 立即拉屎
          if (this.resolvedTimeout) {
            clearTimeout(this.resolvedTimeout);
            this.resolvedTimeout = null;
          }
          this.waitingStartTime = Date.now();
          this.setState(DuckState.WaitingInput, { source: payload.tool_name });
        } else if (this.currentState === DuckState.WaitingInput) {
          // 从等待中恢复（用户已批准）→ 引爆
          this.triggerResolved();
        } else {
          if (this.currentState !== DuckState.Running) {
            this.setState(DuckState.Running, { source: "PreToolUse" });
          }
          // 普通工具：若迟迟不结束，判定为在等你批准权限 → 拉屎
          this.armPendingWait();
        }
        break;

      case "PostToolUse":
        this.clearPendingWait();
        // 交互式工具收到回答，或从等待中恢复（权限已批）→ 引爆清屎
        if (this.isWaitingTool(payload.tool_name) || this.currentState === DuckState.WaitingInput) {
          this.triggerResolved();
        }
        break;

      case "Notification":
        // Claude Code 的 Notification 事件 = 需要用户关注（权限确认 / 空闲等待）。
        // 真实 payload 没有 type=permission_prompt 字段，所以只要收到 Notification 就进入等待。
        this.clearPendingWait();
        if (this.resolvedTimeout) {
          clearTimeout(this.resolvedTimeout);
          this.resolvedTimeout = null;
        }
        this.waitingStartTime = Date.now();
        this.setState(DuckState.WaitingInput, { waitStartTime: this.waitingStartTime });
        break;

      case "Stop":
        // 任务结束，转 Done（清空 resolved / pending 的超时）
        this.clearPendingWait();
        if (this.resolvedTimeout) {
          clearTimeout(this.resolvedTimeout);
          this.resolvedTimeout = null;
        }
        this.setState(DuckState.Done, { source: payload.status || "normal" });

        // Done 持续 1s 后回到 Idle
        setTimeout(() => {
          if (this.currentState === DuckState.Done) {
            this.setState(DuckState.Idle);
          }
        }, 1000);
        break;

      case "StopFailure":
        // 中断或失败，做特殊处理（不播完成叫声）
        this.clearPendingWait();
        if (this.resolvedTimeout) {
          clearTimeout(this.resolvedTimeout);
          this.resolvedTimeout = null;
        }
        this.setState(DuckState.Idle, { source: "StopFailure" });
        break;

      default:
        console.warn(`[QuackCode] Unknown hook event: ${hookType}`);
    }
  }

  // 会“卡住等用户”的交互式工具：调用时应进入等待（拉屎），而非普通运行
  private isWaitingTool(toolName?: string): boolean {
    return toolName === "AskUserQuestion";
  }

  private triggerResolved() {
    if (this.resolvedTimeout) {
      clearTimeout(this.resolvedTimeout);
    }

    this.setState(DuckState.Resolved, { timestamp: Date.now() });

    // Resolved 过渡态持续 1~1.5s，然后回到 Running
    this.resolvedTimeout = setTimeout(() => {
      if (this.currentState === DuckState.Resolved) {
        this.setState(DuckState.Running);
      }
      this.resolvedTimeout = null;
    }, 1200);
  }

  getState(): DuckState {
    return this.currentState;
  }

  getWaitingDuration(): number {
    if (this.currentState === DuckState.WaitingInput && this.waitingStartTime > 0) {
      return Date.now() - this.waitingStartTime;
    }
    return 0;
  }
}
