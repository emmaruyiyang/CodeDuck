import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onStateChange: (callback: (data: any) => void) => {
    ipcRenderer.on("state-change", (event, data) => callback(data));
  },
  onWalkMode: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on("walk-mode", (event, enabled) => callback(enabled));
  },
  onLayout: (callback: (data: any) => void) => {
    ipcRenderer.on("layout", (event, data) => callback(data));
  },
  onMute: (callback: (muted: boolean) => void) => {
    ipcRenderer.on("mute", (event, m) => callback(m));
  },
  onKeySound: (callback: (data: any) => void) => {
    ipcRenderer.on("key-sound", (event, data) => callback(data));
  },
  showContextMenu: () => {
    ipcRenderer.send("show-context-menu");
  },
  setIgnoreMouse: (ignore: boolean) => {
    ipcRenderer.send("set-ignore-mouse", ignore);
  },
  // 点击鸭子：切换“从左往右走 / 原地跳”
  toggleWalk: () => {
    ipcRenderer.send("toggle-walk");
  },
  // 按当前图标高度上报所需头顶空间
  reportHeadroom: (px: number) => {
    ipcRenderer.send("headroom", px);
  },
  // 调试：把渲染层日志回传到主进程终端
  log: (msg: string) => {
    ipcRenderer.send("renderer-log", msg);
  },
});

export {};
