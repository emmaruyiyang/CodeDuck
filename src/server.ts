import * as http from "http";
import { DuckStateMachine, HookPayload } from "./stateMachine";

// 固定端口：让注入到 ~/.claude/settings.json 的 hook 命令跨重启保持有效
export const QUACKCODE_PORT = 37917;

export class QuackCodeServer {
  private server: http.Server | null = null;
  private port: number = QUACKCODE_PORT;
  private stateMachine: DuckStateMachine;

  constructor(stateMachine: DuckStateMachine) {
    this.stateMachine = stateMachine;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.method === "POST") {
          let body = "";

          req.on("data", (chunk) => {
            body += chunk.toString();
          });

          req.on("end", () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              this.handleHookEvent(req.url || "", payload);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } catch (error) {
              console.error("[QuackCode] Error parsing hook payload:", error);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
        } else if (req.url === "/health" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.listen(QUACKCODE_PORT, "127.0.0.1", () => {
        this.port = QUACKCODE_PORT;
        console.log(`[QuackCode] Hook server listening on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });

      this.server.on("error", (error) => {
        console.error("[QuackCode] Server error:", error);
        reject(error);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log("[QuackCode] Hook server stopped");
    }
  }

  private handleHookEvent(url: string, payload: HookPayload) {
    // 路由到状态机
    if (url.includes("prompt-submit")) {
      this.stateMachine.handleHookEvent("UserPromptSubmit", payload);
    } else if (url.includes("tool-start")) {
      this.stateMachine.handleHookEvent("PreToolUse", payload);
    } else if (url.includes("tool-end")) {
      this.stateMachine.handleHookEvent("PostToolUse", payload);
    } else if (url.includes("notify")) {
      this.stateMachine.handleHookEvent("Notification", payload);
    } else if (url.includes("stop")) {
      this.stateMachine.handleHookEvent("Stop", payload);
    } else {
      console.warn(`[QuackCode] Unknown hook URL: ${url}`);
    }
  }

  getPort(): number {
    return this.port;
  }
}
