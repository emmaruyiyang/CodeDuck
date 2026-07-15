import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// 我们自己 hook 命令里的标记，用于识别/清理，避免误删用户的 hooks
const MARKER = "quackcode-hook";

// 事件 → 本地 server 路由
const EVENT_ROUTES: Record<string, string> = {
  UserPromptSubmit: "prompt-submit",
  PreToolUse: "tool-start",
  PostToolUse: "tool-end",
  Notification: "notify",
  Stop: "stop",
};

export class HooksManager {
  private claudeSettingsPath: string;

  constructor() {
    const homeDir = os.homedir();
    this.claudeSettingsPath = path.join(homeDir, ".claude", "settings.json");
  }

  // command 型 hook：curl 把事件（连同 stdin JSON）POST 给本地 server。
  // 末尾 `# quackcode-hook` 作为标记，便于只清理我们自己的条目。
  private commandHook(port: number, route: string) {
    const url = `http://127.0.0.1:${port}/hook/${route}`;
    const cmd = `curl -s -m 2 -X POST '${url}' -H 'Content-Type: application/json' -d @- >/dev/null 2>&1 || true # ${MARKER}`;
    return { hooks: [{ type: "command", command: cmd }] };
  }

  private isOurEntry(entry: any): boolean {
    return (
      entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some(
        (h: any) => typeof h.command === "string" && h.command.includes(MARKER)
      )
    );
  }

  // 合并注入：保留用户已有 hooks，只去掉我们旧条目再追加新的（幂等、不覆盖）
  async injectHooks(port: number): Promise<boolean> {
    try {
      const settings = this.loadSettings();
      if (!settings.hooks) settings.hooks = {};

      for (const [event, route] of Object.entries(EVENT_ROUTES)) {
        const arr = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
        const cleaned = arr.filter((e: any) => !this.isOurEntry(e)); // 去掉旧的自己（换端口/升级）
        cleaned.push(this.commandHook(port, route));
        settings.hooks[event] = cleaned;
      }

      this.saveSettings(settings);
      console.log("[QuackCode] Hooks 已合并注入:", this.claudeSettingsPath);
      return true;
    } catch (error) {
      console.error("[QuackCode] Failed to inject hooks:", error);
      return false;
    }
  }

  // 只移除我们自己的 hook 条目，保留用户其它 hooks
  async removeHooks(): Promise<boolean> {
    try {
      const settings = this.loadSettings();
      if (!settings.hooks) return true;

      for (const event of Object.keys(EVENT_ROUTES)) {
        if (!Array.isArray(settings.hooks[event])) continue;
        const cleaned = settings.hooks[event].filter((e: any) => !this.isOurEntry(e));
        if (cleaned.length > 0) settings.hooks[event] = cleaned;
        else delete settings.hooks[event];
      }

      this.saveSettings(settings);
      console.log("[QuackCode] Hooks 已移除（仅自身）");
      return true;
    } catch (error) {
      console.error("[QuackCode] Failed to remove hooks:", error);
      return false;
    }
  }

  private loadSettings(): any {
    try {
      if (fs.existsSync(this.claudeSettingsPath)) {
        const content = fs.readFileSync(this.claudeSettingsPath, "utf-8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn("[QuackCode] 读取 settings.json 失败，将新建");
    }
    return {};
  }

  private saveSettings(settings: any) {
    const dir = path.dirname(this.claudeSettingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.claudeSettingsPath, JSON.stringify(settings, null, 2), "utf-8");
  }

  getSettingsPath(): string {
    return this.claudeSettingsPath;
  }
}
