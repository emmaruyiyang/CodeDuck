import * as vscode from "vscode";
import { DuckStateMachine, DuckState } from "./stateMachine";
import { QuackCodeServer } from "./server";
import { HooksManager } from "./hooksManager";

let stateMachine: DuckStateMachine;
let server: QuackCodeServer;
let hooksManager: HooksManager;
let panel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log("[QuackCode] Extension activated!");

  // 初始化核心模块
  stateMachine = new DuckStateMachine();
  hooksManager = new HooksManager();

  // 启动 HTTP server
  server = new QuackCodeServer(stateMachine);
  const port = await server.start();

  // 注入 hooks
  await hooksManager.injectHooks(port);

  // 监听状态变化
  stateMachine.onStateChange((state: DuckState, data?: any) => {
    console.log(`[QuackCode] Duck state changed to: ${state}`, data);
    updateWebview(state, data);
  });

  // 注册命令：切换静音
  context.subscriptions.push(
    vscode.commands.registerCommand("quackcode.mute", () => {
      vscode.window.showInformationMessage("QuackCode: Mute toggled (TODO)");
    })
  );

  // 注册命令：创建/显示鸭子面板
  context.subscriptions.push(
    vscode.commands.registerCommand("quackcode.show", () => {
      showDuckPanel(context);
    })
  );

  // 自动打开鸭子面板
  await showDuckPanel(context);

  // 清理
  context.subscriptions.push({
    dispose: () => {
      server.stop();
      hooksManager.removeHooks();
    },
  });
}

async function showDuckPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Two);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "quackcode",
    "🦆 QuackCode",
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)],
    }
  );

  panel.webview.html = getWebviewContent();

  panel.onDidDispose(() => {
    panel = undefined;
  });

  // 向 webview 发送初始状态
  const initialState = stateMachine.getState();
  panel.webview.postMessage({
    type: "stateChange",
    state: initialState,
    waitingDuration: stateMachine.getWaitingDuration(),
  });
}

function updateWebview(state: DuckState, data?: any) {
  if (!panel) {
    return;
  }

  panel.webview.postMessage({
    type: "stateChange",
    state: state,
    data: data,
    waitingDuration: stateMachine.getWaitingDuration(),
  });
}

function getWebviewContent(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>QuackCode Duck</title>
      <style>
        * { box-sizing: border-box; }

        body {
          margin: 0;
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #fff;
        }

        .container {
          text-align: center;
          max-width: 600px;
        }

        h1 {
          margin: 0 0 30px 0;
          font-size: 32px;
        }

        /* Duck and animations */
        .duck-area {
          position: relative;
          width: 120px;
          height: 180px;
          margin: 0 auto 30px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .duck {
          font-size: 100px;
          line-height: 1;
          animation: idle 2s ease-in-out infinite;
        }

        @keyframes idle {
          0%, 100% { transform: translateY(0) rotateZ(-2deg); }
          50% { transform: translateY(-8px) rotateZ(2deg); }
        }

        @keyframes jump {
          0%, 100% { transform: translateY(0) rotateZ(0deg); }
          50% { transform: translateY(-60px) rotateZ(-5deg); }
        }

        @keyframes quack {
          0%, 100% { transform: scaleY(1); }
          25% { transform: scaleY(0.8); }
          50% { transform: scaleY(1); }
        }

        .duck.running {
          animation: jump 0.5s ease-in-out infinite;
        }

        .duck.waiting {
          animation: quack 0.4s ease-in-out 2s infinite;
        }

        .duck.resolved {
          animation: jump 0.3s ease-out;
        }

        .duck.done {
          animation: none;
        }

        /* Status display */
        .status {
          font-size: 24px;
          font-weight: 600;
          margin: 20px 0;
          min-height: 32px;
          letter-spacing: 0.5px;
        }

        .status.waiting {
          color: #ffeb3b;
          animation: pulse 0.6s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .status.resolved {
          animation: bounce 0.5s ease-out;
        }

        @keyframes bounce {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        /* Poop stack */
        .poops-container {
          margin: 30px 0;
          min-height: 80px;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: flex-start;
          gap: 6px;
          flex-direction: row;
          max-width: 300px;
          margin-left: auto;
          margin-right: auto;
        }

        .poop {
          font-size: 32px;
          display: inline-block;
          animation: poop-appear 0.4s ease-out;
        }

        @keyframes poop-appear {
          0% {
            opacity: 0;
            transform: translateY(-20px) scale(0.5);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .poop.exploding {
          animation: poop-explode 0.5s ease-out forwards;
        }

        @keyframes poop-explode {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-40px) scale(0.2) rotateZ(720deg);
          }
        }

        /* Bomb animation */
        .bomb {
          position: absolute;
          font-size: 48px;
          animation: bomb-explode 0.6s ease-out forwards;
        }

        @keyframes bomb-explode {
          0% {
            opacity: 1;
            transform: translateY(-20px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-100px) scale(0);
          }
        }

        /* Debug panel */
        .debug-info {
          margin-top: auto;
          padding: 15px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          max-width: 500px;
          text-align: left;
          max-height: 150px;
          overflow-y: auto;
          margin-bottom: 20px;
        }

        .debug-line {
          margin: 2px 0;
          opacity: 0.8;
        }

        /* Controls */
        .controls {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 20px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.4);
          color: #fff;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .btn:hover {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.6);
        }

        .waiting-count {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🦆 QuackCode</h1>

        <div class="duck-area">
          <div class="duck" id="duck">🦆</div>
          <div id="bomb"></div>
        </div>

        <div class="status" id="status">Waiting for Claude Code...</div>
        <div class="waiting-count" id="waitingCount"></div>

        <div class="poops-container" id="poops"></div>

        <div class="controls">
          <button class="btn" id="btnRunning">Test: Running</button>
          <button class="btn" id="btnWaiting">Test: Waiting</button>
          <button class="btn" id="btnResolved">Test: Resolved</button>
          <button class="btn" id="btnDone">Test: Done</button>
        </div>

        <div class="debug-info" id="debug"></div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let currentState = 'idle';
        let poopCount = 0;
        const maxPoops = 5;
        let debugLogs = [];
        let waitingStartTime = 0;
        let waitingInterval = null;
        let quackInterval = null;
        let audioContext = null;

        // Initialize Web Audio
        function getAudioContext() {
          if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          return audioContext;
        }

        // Play quack sound (more realistic duck sound)
        function playQuack() {
          const ctx = getAudioContext();
          const now = ctx.currentTime;
          const duration = 0.4;

          // Main deep quack sound
          const osc1 = ctx.createOscillator();
          osc1.type = 'sine';
          const gain1 = ctx.createGain();
          osc1.connect(gain1);
          gain1.connect(ctx.destination);

          osc1.frequency.setValueAtTime(250, now);
          osc1.frequency.linearRampToValueAtTime(180, now + duration * 0.7);
          osc1.frequency.linearRampToValueAtTime(160, now + duration);

          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.25, now + 0.05);
          gain1.gain.linearRampToValueAtTime(0.2, now + duration * 0.6);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + duration);

          // Higher frequency for harshness (quack characteristic)
          const osc2 = ctx.createOscillator();
          osc2.type = 'square';
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);

          osc2.frequency.setValueAtTime(450, now);
          osc2.frequency.linearRampToValueAtTime(350, now + duration);

          gain2.gain.setValueAtTime(0, now);
          gain2.gain.linearRampToValueAtTime(0.1, now + 0.05);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + duration);

          // Vibrato effect
          const vibrato = ctx.createOscillator();
          vibrato.frequency.setValueAtTime(5, now); // 5Hz vibrato
          const vibratoGain = ctx.createGain();
          vibrato.connect(vibratoGain);
          vibratoGain.connect(gain1.gain);
          vibratoGain.gain.setValueAtTime(0.02, now);

          osc1.start(now);
          osc2.start(now);
          vibrato.start(now);

          osc1.stop(now + duration);
          osc2.stop(now + duration);
          vibrato.stop(now + duration);
        }

        // Play bomb explosion sound
        function playBoom() {
          const ctx = getAudioContext();
          const now = ctx.currentTime;
          const duration = 0.4;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);

          // Explosion: high frequency dropping fast
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + duration);

          gain.gain.setValueAtTime(0.5, now);
          gain.gain.exponentialRampToValueAtTime(0, now + duration);

          osc.start(now);
          osc.stop(now + duration);
        }

        // Play done/complete sound (happy quack)
        function playDone() {
          const ctx = getAudioContext();
          const now = ctx.currentTime;
          const duration = 0.35;

          // Main happy quack
          const osc1 = ctx.createOscillator();
          osc1.type = 'sine';
          const gain1 = ctx.createGain();
          osc1.connect(gain1);
          gain1.connect(ctx.destination);

          osc1.frequency.setValueAtTime(300, now);
          osc1.frequency.linearRampToValueAtTime(350, now + duration * 0.5);
          osc1.frequency.linearRampToValueAtTime(280, now + duration);

          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
          gain1.gain.linearRampToValueAtTime(0.15, now + duration * 0.7);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + duration);

          // Higher frequency component
          const osc2 = ctx.createOscillator();
          osc2.type = 'sine';
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);

          osc2.frequency.setValueAtTime(500, now);
          osc2.frequency.linearRampToValueAtTime(520, now + duration);

          gain2.gain.setValueAtTime(0, now);
          gain2.gain.linearRampToValueAtTime(0.08, now + 0.05);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + duration);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + duration);
          osc2.stop(now + duration);
        }

        function addDebug(msg) {
          const time = new Date().toLocaleTimeString();
          debugLogs.unshift(\`[\${time}] \${msg}\`);
          if (debugLogs.length > 15) debugLogs.pop();
          const debugDiv = document.getElementById('debug');
          debugDiv.innerHTML = debugLogs.map(log => \`<div class="debug-line">\${log}</div>\`).join('');
        }

        function updateWaitingCount() {
          const countDiv = document.getElementById('waitingCount');
          if (currentState === 'waitingInput' && waitingStartTime > 0) {
            const elapsed = Math.round((Date.now() - waitingStartTime) / 1000);
            countDiv.textContent = \`⏱️ Waiting for \${elapsed}s...\`;
          } else {
            countDiv.textContent = '';
          }
        }

        function setState(newState) {
          const duck = document.getElementById('duck');
          const status = document.getElementById('status');
          const poopsContainer = document.getElementById('poops');
          const bomb = document.getElementById('bomb');

          // Remove all animation classes
          duck.classList.remove('running', 'waiting', 'resolved', 'done');

          switch (newState) {
            case 'running':
              duck.classList.add('running');
              status.textContent = '🏃 Running...';
              status.classList.remove('waiting');
              if (waitingInterval) clearInterval(waitingInterval);
              if (quackInterval) clearInterval(quackInterval);
              updateWaitingCount();
              addDebug('State → Running (🦆 jumping)');
              break;

            case 'waitingInput':
              duck.classList.add('waiting');
              status.textContent = '⏳ Waiting for input...';
              status.classList.add('waiting');
              waitingStartTime = Date.now();
              addDebug('State → WaitingInput (🦆 quacking, 💩 stacking)');

              if (quackInterval) clearInterval(quackInterval);
              if (waitingInterval) clearInterval(waitingInterval);

              // Play quack every 3.5 seconds
              quackInterval = setInterval(() => {
                playQuack();
              }, 3500);

              // Add poop every 3 seconds
              waitingInterval = setInterval(() => {
                if (poopCount < maxPoops) {
                  poopCount++;
                  const poop = document.createElement('span');
                  poop.className = 'poop';
                  poop.textContent = '💩';
                  poopsContainer.appendChild(poop);
                  addDebug(\`💩 poop #\${poopCount}\`);
                }
                updateWaitingCount();
              }, 3000);
              break;

            case 'resolved':
              duck.classList.add('resolved');
              status.textContent = '💣 BOOM!';
              status.classList.remove('waiting');
              status.classList.add('resolved');
              if (waitingInterval) clearInterval(waitingInterval);
              if (quackInterval) clearInterval(quackInterval);
              playBoom();
              addDebug('State → Resolved (💣 explosion!)');

              // Trigger bomb animation
              bomb.innerHTML = '💣';
              bomb.style.animation = 'none';
              setTimeout(() => {
                bomb.style.animation = 'bomb-explode 0.6s ease-out forwards';
              }, 10);

              // Explode poops
              const poops = poopsContainer.querySelectorAll('.poop');
              poops.forEach((p, i) => {
                setTimeout(() => {
                  p.classList.add('exploding');
                }, i * 50);
              });

              setTimeout(() => {
                bomb.innerHTML = '';
                poopsContainer.textContent = '';
                poopCount = 0;
              }, 600);
              break;

            case 'done':
              duck.classList.add('done');
              status.textContent = '✨ Done!';
              status.classList.remove('waiting');
              if (waitingInterval) clearInterval(waitingInterval);
              if (quackInterval) clearInterval(quackInterval);
              playDone();
              updateWaitingCount();
              addDebug('State → Done (task completed)');
              break;

            case 'idle':
            default:
              status.textContent = '😴 Idle (waiting for Claude Code)';
              status.classList.remove('waiting');
              if (waitingInterval) clearInterval(waitingInterval);
              updateWaitingCount();
              poopsContainer.textContent = '';
              poopCount = 0;
              addDebug('State → Idle');
              break;
          }

          currentState = newState;
        }

        // Receive state changes from extension
        window.addEventListener('message', (event) => {
          const message = event.data;
          if (message.type === 'stateChange') {
            setState(message.state);
          }
        });

        // Test buttons
        document.getElementById('btnRunning').addEventListener('click', () => {
          setState('running');
        });
        document.getElementById('btnWaiting').addEventListener('click', () => {
          setState('waitingInput');
        });
        document.getElementById('btnResolved').addEventListener('click', () => {
          setState('resolved');
        });
        document.getElementById('btnDone').addEventListener('click', () => {
          setState('done');
        });

        addDebug('WebView initialized. Ready for state updates.');
        setState('idle');
      </script>
    </body>
    </html>
  `;
}

export function deactivate() {
  console.log("[QuackCode] Extension deactivated");
}
