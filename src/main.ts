import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen } from "electron";
import * as path from "path";
import { DuckStateMachine, DuckState } from "./stateMachine";
import { QuackCodeServer } from "./server";
import { HooksManager } from "./hooksManager";
import { WindowTracker, WindowBounds } from "./windowTracker";

// 调试开关：设 ELECTRON_DEV=true 才开 DevTools 和详细日志
const DEV = process.env.ELECTRON_DEV === "true";
const log = (...a: any[]) => { if (DEV) console.log(...a); };

// 允许 Web Audio 无需用户手势即可播放（悬浮鸭子全程无点击，否则声音会被浏览器策略挂起）
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stateMachine: DuckStateMachine;
let server: QuackCodeServer;
let hooksManager: HooksManager;
let tracker: WindowTracker;

let followEnabled = true; // 遮罩是否跟随/贴合 VS Code 窗口（右键可切换）
let walkEnabled = true; // running 时是否“从左往右走”；false = 原地跳（点击鸭子切换）
let muted = false; // 静音（托盘切换）
let lastBounds: WindowBounds | null = null;
let cleanedUp = false;

// 鸭子头顶想要预留的空间（站在 VS Code 顶边“上方”，脚踩边缘）。
// 不写死：渲染层按当前图标实测高度 + 跳跃高度算出所需值上报，随换图标自适应。
let desiredHeadroom = 110; // 默认值，收到渲染层上报后更新
let lastInset = -1;

// 遮罩对齐 VS Code：向上多延伸 inset（头顶空间，全屏/顶屏时为 0），
// 使遮罩覆盖 [VS Code 顶边 - inset, VS Code 底边]；inset 告诉渲染层顶边在哪，鸭子脚踩那里。
function syncWindowToBounds(bounds: WindowBounds) {
  if (!mainWindow) return;
  const disp = screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  const topLimit = disp.workArea.y;                    // 不越过菜单栏
  const availableAbove = Math.max(0, bounds.y - topLimit);
  const inset = Math.min(desiredHeadroom, availableAbove); // 头顶实际可用空间（全屏时=0）

  const x = bounds.x;
  const y = bounds.y - inset;
  const width = bounds.width;
  const height = bounds.height + inset;

  const b = mainWindow.getBounds();
  if (b.x !== x || b.y !== y || b.width !== width || b.height !== height) {
    mainWindow.setBounds({ x, y, width, height });
  }
  // 顶边在遮罩内的 y 偏移（= inset），变化时通知渲染层重新摆鸭子
  if (inset !== lastInset) {
    lastInset = inset;
    mainWindow.webContents.send("layout", { topInset: inset });
  }
}

async function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;

  // 初始给个占位尺寸，追踪到 VS Code 后会自动对齐覆盖
  mainWindow = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: Math.min(1000, wa.width),
    height: Math.min(700, wa.height),
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      // 关闭沙箱：否则 esbuild 的 CJS preload 会因缺少 module 全局而加载失败
      sandbox: false,
    },
  });

  // 浮在最上层（含其它 App 全屏），并默认鼠标穿透（只有悬停鸭子身上才可交互）
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  if (DEV) mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error("[QuackCode] preload 加载失败:", preloadPath, error);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 状态机变化 → 通知渲染层（走/跳/拉屎/炸屎/完成都在渲染层实现）
  stateMachine.onStateChange((state: DuckState, data?: any) => {
    log(`[QuackCode] State changed: ${state}`, data);
    if (mainWindow) {
      mainWindow.webContents.send("state-change", { state, walkEnabled, muted });
    }
  });

  // 追踪 VS Code / Cursor 窗口，实时对齐遮罩
  tracker = new WindowTracker(["Code", "Cursor", "Code - Insiders"], DEV);
  tracker.start(400, (bounds) => {
    if (!bounds || !mainWindow) return;
    lastBounds = bounds;
    if (!followEnabled) return;
    syncWindowToBounds(bounds);
  });
}

// 菜单栏托盘：退出 / 静音 / 跟随开关
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🦆"); // 菜单栏显示鸭子
  tray.setToolTip("QuackCode");
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: muted ? "Unmute" : "Mute",
      click: () => {
        muted = !muted;
        if (mainWindow) mainWindow.webContents.send("mute", muted);
        refreshTrayMenu();
      },
    },
    {
      label: "Follow VS Code Window",
      type: "checkbox",
      checked: followEnabled,
      click: () => {
        followEnabled = !followEnabled;
        if (followEnabled && lastBounds) syncWindowToBounds(lastBounds);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "Quit QuackCode", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// 统一清理：移除自身 hooks、停 server/tracker（退出前调用）
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try { if (tracker) tracker.stop(); } catch {}
  try { if (server) server.stop(); } catch {}
  try { if (hooksManager) hooksManager.removeHooks(); } catch {}
}

async function initializeApp() {
  stateMachine = new DuckStateMachine();
  hooksManager = new HooksManager();

  server = new QuackCodeServer(stateMachine);
  const port = await server.start();

  await hooksManager.injectHooks(port);

  console.log(`[QuackCode] Initialized with port ${port}`);
}

app.on("ready", async () => {
  await initializeApp();
  await createWindow();
  createTray();
});

// 关掉鸭子窗口不退出（常驻托盘）；真正退出走 before-quit
app.on("window-all-closed", () => {
  // 保持后台运行，靠托盘"退出 QuackCode"退出
});

app.on("before-quit", () => {
  cleanup();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 右键菜单
ipcMain.on("show-context-menu", () => {
  const template = [
    {
      label: "Follow VS Code Window",
      type: "checkbox" as const,
      checked: followEnabled,
      click: () => {
        followEnabled = !followEnabled;
        if (followEnabled && lastBounds) syncWindowToBounds(lastBounds);
        refreshTrayMenu();
      },
    },
    {
      label: muted ? "Unmute" : "Mute",
      click: () => {
        muted = !muted;
        if (mainWindow) mainWindow.webContents.send("mute", muted);
        refreshTrayMenu();
      },
    },
    { type: "separator" as const },
    { label: "Quit QuackCode", click: () => app.quit() },
  ];
  const menu = Menu.buildFromTemplate(template as any);
  if (mainWindow) menu.popup({ window: mainWindow });
});

// 渲染层根据鼠标是否悬停在鸭子身上，切换鼠标穿透
ipcMain.on("set-ignore-mouse", (event, ignore: boolean) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

// 点击鸭子：切换“从左往右走 / 原地跳”
ipcMain.on("toggle-walk", () => {
  walkEnabled = !walkEnabled;
  console.log("[QuackCode] 行走模式:", walkEnabled ? "从左往右走" : "原地跳");
  if (mainWindow) mainWindow.webContents.send("walk-mode", walkEnabled);
});

// 调试：渲染层日志（仅 DEV）
ipcMain.on("renderer-log", (event, msg: string) => {
  log("[QuackCode][renderer]", msg);
});

// 渲染层按当前图标高度上报所需头顶空间（换图标自适应）
ipcMain.on("headroom", (event, px: number) => {
  if (typeof px === "number" && px > 0 && px !== desiredHeadroom) {
    desiredHeadroom = px;
    lastInset = -1; // 强制下次 sync 重新发 layout
    if (followEnabled && lastBounds) syncWindowToBounds(lastBounds); // 立即生效
  }
});

// Graceful shutdown
process.on("SIGTERM", () => { cleanup(); app.quit(); });
process.on("SIGINT", () => { cleanup(); app.quit(); });

export { mainWindow, stateMachine, server };
