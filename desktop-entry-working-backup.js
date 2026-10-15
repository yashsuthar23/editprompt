// desktop-entry.js
// This is the real entry point for the packaged .exe (see sea-config.json).
// It starts the Express server (server.js) exactly as before, then opens a
// native "app window" (no browser tabs/address bar) instead of leaving the
// user staring at a console. Closing that window shuts the whole app down.

import { spawn } from "child_process";
import net from "net";
import fs from "fs";

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// Static import: runs server.js top-to-bottom, including app.listen(...),
// as soon as this module loads.
import "./server.js";

const port = Number(process.env.PORT || 3000);
const url = `http://localhost:${port}`;

function waitForPort(p, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function attempt() {
      const socket = net.connect(p, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(attempt, 150);
      });
    })();
  });
}

function findWindowsBrowser() {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] || "";
  const candidates = [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

function openDefaultBrowser() {
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const ready = await waitForPort(port);
  if (!ready) {
    console.error("Server did not come up in time.");
    process.exit(1);
  }

  if (process.platform === "win32") {
    const browser = findWindowsBrowser();
    if (browser) {
      const child = spawn(
        browser,
        [`--app=${url}`, "--window-size=1360,860", "--new-window", `--user-data-dir=${process.env.LOCALAPPDATA}\\EditPromptApp\\ChromeProfile`],
        { stdio: "ignore" }
      );
      // App window closed -> quit the whole app (server included), like real software.
      child.on("exit", () => process.exit(0));
      child.on("error", () => openDefaultBrowser());
    } else {
      // No Chrome/Edge app-mode available — fall back to a normal browser tab.
      openDefaultBrowser();
    }
  } else {
    openDefaultBrowser();
  }
}

main();
