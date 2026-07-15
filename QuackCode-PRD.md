# QuackCode — 产品需求文档 (PRD)

> **一句话**:一个 VS Code 陪伴插件,把你的 Claude Code 会话变成一只会动的小鸭子——Claude 运行时它不停往前跳,需要你输入时它焦急鸭叫(还会拉屎 💩),你一响应就用炸弹把屎炸飞,任务完成时心满意足地叫一声。

---

## 1. 背景与动机

使用 Claude Code 时,一个高频痛点是:Claude 在终端里跑一段时间后会停下来**等待用户确认权限或输入指令**,但这个提示往往埋在终端输出里,如果用户切去做别的事,就会漏掉,导致 Claude 一直干等、白白浪费时间。

QuackCode 用一只可视化的小鸭子把 Claude Code 的实时状态"翻译"成一眼能懂、且有声音提醒的形式,让用户无需盯着终端也能知道:Claude 在忙、Claude 在等我、Claude 干完了。趣味性(拉屎、炸弹)既是记忆点,也承担实际功能(屎堆越多 = 晾了 Claude 越久,是个天然的等待计时器)。

## 2. 目标与非目标

**目标**
- 实时、可靠地反映 Claude Code 的四个关键状态,不依赖解析终端文本
- 在"等待用户输入"时提供**主动的声音 + 视觉提醒**,降低漏看概率
- 安装和配置足够简单(一键注入 hooks,不需要用户手改 JSON)

**非目标(本期不做)**
- 不做跨 VS Code 窗口的状态聚合(每个窗口独立一只鸭子)
- 不解析 Claude Code 的对话内容,不做任务进度百分比
- 不支持 Claude Code 以外的其他 CLI/工具

## 3. 关键技术约束(务必先知道)

**VS Code 扩展无法在编辑器顶部做悬浮覆盖式组件。** 没有"标题栏悬浮层"这个扩展点。丰富动画(跳/叫/拉屎/爆炸)必须用 Webview 实现,而 Webview 只能挂在固定区域。可选落点:

| 方案 | 位置 | 评价 |
|---|---|---|
| Status Bar | 底部状态栏 | 太小,撑不起拉屎/爆炸动画,不选 |
| **Panel(挨着终端)** | 底部面板区 | Claude Code 就跑在终端里,语境最合理 ✅ |
| **Editor Tab** | 编辑区顶部作为一个 tab | 最接近"上方",动画空间足,但占编辑空间 ✅ |
| Sidebar View | 侧边栏 | 竖直空间大,但不在"上方" |

> **待定决策**:Panel 还是 Editor Tab。默认建议先做 **Editor Tab**(最贴近"鸭子在上方"的诉求),位置可在设置里切换。

## 4. 状态机设计

核心是一个 5 态状态机,由 Claude Code Hooks 事件驱动。

| 状态 | 进入条件 | 退出条件 | 鸭子表现 |
|---|---|---|---|
| **Idle 待机** | 插件启动 / 上一轮 `Stop` 之后 | 收到 `UserPromptSubmit` | 静止或轻微待机小动作,静音 |
| **Running 运行** | `UserPromptSubmit` / `PreToolUse` / `PostToolUse` | 收到 `Notification` 或 `Stop` | 持续往前跳,静音 |
| **WaitingInput 等待** | `Notification`(类型为 `permission_prompt` / `idle_prompt`) | 下一个 `PreToolUse` 或新的 `UserPromptSubmit` | 间歇鸭叫 + 逐渐拉屎堆积 |
| **Resolved 引爆** | 从 WaitingInput 收到处理信号(过渡态,持续约 1~1.5s) | 动画播完自动转 Running | 停止叫声 + 炸弹把屎炸开 |
| **Done 收尾** | 收到 `Stop` | 单次叫声播完转 Idle | 清脆叫一声 + 完成小动作(摇尾/点头) |

**状态流转图**

```
Idle ──UserPromptSubmit──▶ Running ──Notification──▶ WaitingInput
 ▲                          │  ▲                          │
 │                          │  │ PreToolUse/UserPromptSubmit
 │                        Stop │  ▼
 └────── Done ◀────────────┘  Resolved(引爆过渡态)──▶ Running
```

**边界情况**
- **用户中断**(Ctrl+C,对应 `StopFailure`):做单独的"愣住"反应,**不要**误当成正常 `Stop` 去播放完成叫声。
- **多会话/多窗口**:每个 VS Code 窗口一只独立鸭子,hook server 端口与 session 绑定,互不干扰。

## 5. 功能需求(逐条细化)

### FR-1 Running:往前跳
- 循环跳跃动画(3~4 帧即可,可含左右轻微晃动增加"卖力感")
- 全程静音(避免长时间运行时一直响)
- **加分项**:跳跃频率随工具调用密集度变化(`PreToolUse` 越频繁跳越快)

### FR-2 WaitingInput:鸭叫 + 拉屎
- 鸭叫为**间歇性**(每 2~3 秒一声),不可连续无间断
- 每隔 3~5 秒在鸭子身后堆一坨 💩,越等越多——作为"晾了 Claude 多久"的视觉计时器
- 屎堆到上限(如 5 坨)封顶,避免视觉溢出

### FR-3 Resolved:炸弹清屎
- 触发瞬间:停止鸭叫 → 播放炸弹动画 → 把堆积的屎全部炸飞/清空
- 配一个与鸭叫**音色区分**的爆炸/"叮"音效,强化"处理完成"的反馈感
- 过渡态短(1~1.5s),之后自动转 Running

> **已知模糊点**:Hooks 没有专门的"用户已确认权限"事件。判定"用户完成反馈"采用启发式:`Notification` 之后只要收到下一个 `PreToolUse` / `PostToolUse`,即视为已处理并引爆。这不是 100% 语义精确,但实际效果符合预期。

### FR-4 Done:结束叫一声
- 单次、平静的一声(与 WaitingInput 的"焦急连叫"明确区分)
- 配一个完成小动作(摇尾/点头),让"完成"更明显

### FR-5 设置项
- **静音开关**:命令面板一键静音,只保留视觉动画(开会时用)
- **位置切换**:Panel / Editor Tab 二选一
- **Hooks 一键注入**:插件激活时检测并写入 `.claude/settings.json`,提供开/关

## 6. 技术架构

```
Claude Code CLI (跑在集成终端里)
      │  hook 触发时 POST 事件 payload
      ▼
Extension Host 内的本地 HTTP server (localhost:<port>)
      │  收到事件 → 更新状态机 → postMessage 发给 webview
      ▼
Webview (小鸭子 UI:SVG/CSS 动画 + <audio> 音效)
```

**事件接入**:用 Claude Code Hooks 的 `http` 类型,直接把事件 POST 到本地端口,无需自己写 shell 脚本转发。需注入的配置示例:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://localhost:9999/hook/prompt-submit" }] }],
    "Notification":     [{ "hooks": [{ "type": "http", "url": "http://localhost:9999/hook/notify" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "http", "url": "http://localhost:9999/hook/tool-start" }] }],
    "Stop":             [{ "hooks": [{ "type": "http", "url": "http://localhost:9999/hook/stop" }] }]
  }
}
```

**技术对照表**

| 需求 | 实现 |
|---|---|
| 事件源 | Claude Code Hooks(`http` 类型)|
| 状态机 | Extension Host 内 TypeScript 维护 |
| UI + 动画 + 音效 | Webview(SVG/CSS + `<audio>`)|
| 位置 | Webview 挂 Panel 或 Editor 区(无法顶部悬浮)|
| 配置注入 | 激活时读写 `.claude/settings.json` |
| 端口 | 本地随机可用端口,与 hooks URL 同步写入 |

## 7. 里程碑

| 阶段 | 交付物 | 预估 |
|---|---|---|
| M1 打通链路 | Hooks 注入 + 本地 HTTP server + 状态机,console 打印状态切换 | 半天 |
| M2 UI 联调 | Webview + 状态机联动,先用 emoji 鸭子跑通四个状态 | 1 天 |
| M3 美术与音效 | SVG 鸭子、跳跃/拉屎/爆炸动画、音效、区分焦急叫与完成叫 | 数小时~数天(看精细度)|
| M4 打磨 | 静音开关、位置切换、中断/多窗口边界处理 | 半天~1 天 |

整体为**周末项目**量级,纯靠公开 Hooks API 即可闭环,无需接触 Claude Code 内部代码。

## 8. 成功标准

- 四个状态在真实使用中判定准确,漏报/误报低
- WaitingInput 的声音提醒能有效降低"漏看确认提示"的发生
- 安装到能用 ≤ 3 步,用户无需手动编辑任何 JSON

## 9. 待决策问题

1. 鸭子位置:**Panel** vs **Editor Tab**(默认建议 Editor Tab)
2. 是否要做"运行时长计时器"加分项
3. 美术风格:走 emoji 简约风,还是自绘 SVG 鸭子
