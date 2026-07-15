# QuackCode 🦆

一只陪你写代码的悬浮小鸭子 —— 挂在 VS Code 窗口上沿，把 **Claude Code** 的实时状态"翻译"成看得见、听得见的动画：

- **Claude 在干活** → 鸭子从左往右**走**
- **Claude 在等你**（问你问题 / 权限确认 / 卡住）→ 鸭子停下**拉屎 💩 + 鸭叫**，越等越多
- **你一响应** → **炸弹把屎炸开 💥**（整屏爆炸）
- **任务完成** → 鸭子叫一声 ✨

> 悬浮层覆盖整个 VS Code 窗口，鸭子踩在窗口顶边上走，💩 从脚下掉到窗口底部。窗口移动/切换，鸭子自动跟随。

---

## 环境要求

- **macOS**（目前仅支持 macOS，Apple Silicon / arm64）
- 已安装 **[Claude Code](https://claude.com/claude-code)** —— QuackCode 就是配合它工作的
- 需要授予 **辅助功能** 权限（用于跟随 VS Code 窗口）

---

## 安装（用户版）

1. 下载 `QuackCode-x.y.z-arm64.dmg`
2. 双击打开，把 **QuackCode** 拖进「应用程序」
3. **首次打开**：在「应用程序」里 **右键 QuackCode → 打开**（未签名，需绕过一次 Gatekeeper）
   - 如提示"已损坏 / 无法验证开发者"，打开「终端」运行：
     ```bash
     xattr -cr /Applications/QuackCode.app
     ```
     然后再右键打开。
4. **授予辅助功能权限**：系统设置 → 隐私与安全性 → **辅助功能** → 打开 **QuackCode** 的开关
   （没有这一步鸭子不会跟随 VS Code 窗口）
5. 从菜单栏 🦆 的「退出 QuackCode」完全退出后重开一次，让权限生效
6. 打开 VS Code，正常使用 Claude Code —— 鸭子会自动出现在窗口上沿

安装后 QuackCode 会自动把 hook 配置**合并**写入 `~/.claude/settings.json`（不会覆盖你已有的 hooks），退出时只移除自己那部分。

---

## 使用

- **点击鸭子**：切换「从左往右走 ↔ 原地跳」
- **右键鸭子** 或 **菜单栏 🦆**：静音 / 跟随 VS Code 窗口开关 / 退出
- 鼠标默认**穿透**鸭子，不会挡住 VS Code 的点击和打字

### 状态对照

| 状态 | 触发 | 鸭子表现 | 声音 |
|---|---|---|---|
| 待机 | 空闲 | 轻微浮动 | 静音 |
| 运行 | Claude 干活 | 从左往右走 | 静音 |
| 等待 | 问你问题 / 权限确认 / 工具卡住 >2s | 停下拉屎 💩 | pupu 音 |
| 引爆 | 你回应后 | 整屏爆炸 💥🔥，💩 四散 | 爆炸音 |
| 完成 | 一轮结束 | 停下 ✨ | 玩具鸭叫 |

---

## 常见问题

- **鸭子不跟随 / 不出现** → 多半是没授辅助功能权限。到 系统设置 → 隐私与安全性 → 辅助功能 打开 QuackCode，然后从菜单栏 🦆 退出重开。
- **没有声音** → 从菜单栏 🦆 确认没开「静音」；声音文件在 App 内的 `data/sound/`。
- **多开 VS Code 时鸭子跟哪个** → 跟你**当前聚焦**的那个主窗口。
- **打开时被系统拦** → 见安装第 3 步（右键打开 / `xattr -cr`）。
- **想彻底移除** → 菜单栏 🦆 退出，删除 `/Applications/QuackCode.app`。hook 配置会在正常退出时自动清理；若有残留可手动编辑 `~/.claude/settings.json` 删掉带 `quackcode-hook` 标记的条目。

---

## 开发者

```bash
npm install          # 装依赖
npm run dev          # 编译并启动（开发模式）
ELECTRON_DEV=true npm run dev   # 开 DevTools + 详细日志
npm run dist         # 打包成 release/QuackCode-*.dmg
```

### 架构

```
Claude Code CLI
    │  hook（curl POST 事件 JSON，固定端口 37917）
    ▼
本地 HTTP Server ──▶ 状态机（5 态）
    │  IPC: state-change
    ▼
Electron 遮罩窗口（覆盖 VS Code）+ 渲染层（鸭子/💩/爆炸/音效）
    ▲
    │  AppleScript 每 400ms 读取聚焦的 VS Code 主窗口坐标
窗口追踪器
```

| 模块 | 文件 |
|---|---|
| 主进程 / 窗口对齐 / 托盘 | `src/main.ts` |
| 状态机 | `src/stateMachine.ts` |
| 本地 HTTP server | `src/server.ts` |
| hooks 注入（合并/清理） | `src/hooksManager.ts` |
| VS Code 窗口追踪（AXMain） | `src/windowTracker.ts` |
| 鸭子 UI / 动画 / 音效 | `renderer/index.html` |
| 动画参数（尺寸/速度/节奏） | `renderer/index.html` 顶部 `CONFIG` |

### 打包配置

在 `package.json` 的 `build` 字段（electron-builder）。自定义 App 图标：放一个 ≥512×512 的 `build/icon.png` 再 `npm run dist`。

---

## 已知限制

- 仅 macOS / arm64（Intel 需另出 universal 包；Windows/Linux 暂不支持）
- 未代码签名（首次打开需右键放行）
- 固定端口 37917（被占用时暂无自动切换）
- 「工具卡住 >2s = 等待」是启发式，长时间的自动命令可能误触发拉屎

---

## License

MIT
