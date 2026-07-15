import { execFile } from "child_process";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 通过 AppleScript(System Events)读取目标 App 前置窗口的坐标与大小。
 * 需要 macOS「辅助功能 / Accessibility」权限。
 *
 * 支持多个候选进程名(VS Code = "Code"，Cursor = "Cursor" 等），
 * 取第一个存在且有窗口的。
 */
export class WindowTracker {
  private timer: NodeJS.Timeout | null = null;
  private candidates: string[];
  private lastError: string = "";
  private lastLog: string = "";
  private activeProcessName: string | null = null;
  private debug: boolean;

  constructor(candidates: string[] = ["Code", "Cursor", "Code - Insiders"], debug = false) {
    this.candidates = candidates;
    this.debug = debug;
  }

  start(intervalMs: number, onBounds: (bounds: WindowBounds | null) => void) {
    const tick = async () => {
      try {
        const bounds = await this.queryBounds();
        onBounds(bounds);
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg !== this.lastError) {
          this.lastError = msg;
          console.warn("[QuackCode][tracker] 读取窗口失败:", msg);
        }
        onBounds(null);
      }
    };

    // 立即跑一次，然后按间隔轮询
    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private queryBounds(): Promise<WindowBounds | null> {
    return new Promise((resolve, reject) => {
      const script = this.buildScript();
      execFile(
        "osascript",
        ["-e", script],
        { timeout: 3000 },
        (error, stdout, stderr) => {
          if (error) {
            const firstLine = (stderr || "").split("\n")[0].trim();
            // 只有确实是权限错误(-1743 / assistive access)才提示去授权；
            // 其它多为窗口瞬时变化(-1719 Invalid index 等)，会自动重试，无需处理。
            if (/assistive access|not allowed|-1743/i.test(firstLine)) {
              return reject(
                new Error(
                  "未授予辅助功能权限，鸭子无法跟随窗口。请到 系统设置 → 隐私与安全性 → 辅助功能，允许你的终端 App（或 Electron）后重启。"
                )
              );
            }
            return reject(new Error((firstLine || "读取窗口失败") + "（瞬时错误，将自动重试）"));
          }

          const out = (stdout || "").trim();
          if (out === "NOTFOUND" || out === "") {
            this.activeProcessName = null;
            return resolve(null);
          }

          // 格式: PROC|ww,hh,xx,yy,title|ww,hh,xx,yy,title|...
          const segs = out.split("|");
          const proc = segs[0];
          this.activeProcessName = proc || null;

          const wins = segs
            .slice(1)
            .map((seg) => {
              const p = seg.split(",");
              return {
                width: parseInt(p[0], 10),
                height: parseInt(p[1], 10),
                x: parseInt(p[2], 10),
                y: parseInt(p[3], 10),
                main: p[4] === "1", // AXMain：该 App 的主窗口
                title: p.slice(5).join(","),
              };
            })
            .filter(
              (o) =>
                !Number.isNaN(o.x) &&
                !Number.isNaN(o.y) &&
                !Number.isNaN(o.width) &&
                !Number.isNaN(o.height)
            );

          // 优先跟「聚焦的主窗口」(AXMain)，带尺寸兜底防误判；否则退回面积最大的大窗口
          let chosen =
            wins.find((o) => o.main && o.width > 200 && o.height > 150) || null;
          if (!chosen) {
            const big = wins
              .filter((o) => o.width > 400 && o.height > 300)
              .sort((a, b) => b.width * b.height - a.width * a.height);
            chosen = big[0] || null;
          }

          // 打印检测到的所有窗口 + 选中的那个（内容变化时才打，避免刷屏）；* 表示 AXMain
          const sig =
            wins
              .map((o) => `${o.width}x${o.height}@(${o.x},${o.y})${o.main ? "*" : ""}"${o.title}"`)
              .join("  ") + " => " + (chosen ? `${chosen.width}x${chosen.height}@(${chosen.x},${chosen.y})` : "无");
          if (this.debug && sig !== this.lastLog) {
            this.lastLog = sig;
            console.log(`[QuackCode][tracker] ${proc} 共${wins.length}个窗口: ${sig}`);
          }

          if (!chosen) return resolve(null);
          resolve({ x: chosen.x, y: chosen.y, width: chosen.width, height: chosen.height });
        }
      );
    });
  }

  getActiveProcessName(): string | null {
    return this.activeProcessName;
  }

  private buildScript(): string {
    // 依次尝试候选进程名；返回该进程「所有窗口」的尺寸/位置/是否主窗口(AXMain)/标题，选择逻辑放到 JS。
    // 每个窗口: ww,hh,xx,yy,main,title ；窗口之间用 | 分隔，第一个字段是进程名。
    const checks = this.candidates
      .map(
        (name) => `
      if exists process "${name}" then
        tell process "${name}"
          set out to "${name}"
          repeat with w in windows
            try
              set s to size of w
              set p to position of w
              set mn to "0"
              try
                if (value of attribute "AXMain" of w) is true then set mn to "1"
              end try
              set t to ""
              try
                set t to name of w
              end try
              set out to out & "|" & (item 1 of s as text) & "," & (item 2 of s as text) & "," & (item 1 of p as text) & "," & (item 2 of p as text) & "," & mn & "," & t
            end try
          end repeat
          if out is not "${name}" then return out
        end tell
      end if`
      )
      .join("\n");

    return `tell application "System Events"\n${checks}\n  return "NOTFOUND"\nend tell`;
  }
}
