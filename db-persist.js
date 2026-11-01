// db-persist.js
// Free permanent storage for editprompt.db on hosts with an ephemeral disk
// (e.g. Render free plan). The database is restored from a PRIVATE GitHub repo
// on startup and backed up to it after changes, so users / orders / history
// stay until an admin deletes them.
//
// Env vars:
//   BACKUP_GITHUB_TOKEN   fine-grained token, "Contents: Read and write" on ONE private repo
//   BACKUP_GITHUB_REPO    owner/repo   (e.g. yash/editprompt-data)  -- must be PRIVATE
//   BACKUP_GITHUB_PATH    file path in repo (default: editprompt.db)
//   BACKUP_GITHUB_BRANCH  branch (default: main)
//   BACKUP_INTERVAL_MIN   safety-net interval in minutes (default: 10)
//   BACKUP_GITHUB_API     API base (default: https://api.github.com) - used for tests

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";

const TOKEN = process.env.BACKUP_GITHUB_TOKEN || "";
const REPO = process.env.BACKUP_GITHUB_REPO || "";
const FILE = process.env.BACKUP_GITHUB_PATH || "editprompt.db";
const BRANCH = process.env.BACKUP_GITHUB_BRANCH || "main";
const API = (process.env.BACKUP_GITHUB_API || "https://api.github.com").replace(/\/$/, "");
const INTERVAL_MIN = Math.max(1, Number(process.env.BACKUP_INTERVAL_MIN || 10));

export const backupEnabled = !!(TOKEN && REPO);

let restoreSettled = false; // true only after a successful restore OR a confirmed "no backup yet"
let remoteSha = null; // git blob sha of the file currently in the repo
let lastHash = null;
let timer = null;
let running = false;
let dirty = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "User-Agent": "editprompt-db-persist",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

const contentsUrl = () =>
  `${API}/repos/${REPO}/contents/${FILE.split("/").map(encodeURIComponent).join("/")}`;

async function getRemote() {
  // metadata (sha)
  const metaRes = await fetch(`${contentsUrl()}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: headers({ Accept: "application/vnd.github+json" }),
  });
  if (metaRes.status === 404) return null;
  if (!metaRes.ok) throw new Error(`GitHub ${metaRes.status}: ${await metaRes.text()}`);
  const meta = await metaRes.json();

  // raw bytes (works for files > 1 MB too)
  const rawRes = await fetch(`${contentsUrl()}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: headers({ Accept: "application/vnd.github.raw+json" }),
  });
  if (!rawRes.ok) throw new Error(`GitHub raw ${rawRes.status}`);
  return { sha: meta.sha, bytes: Buffer.from(await rawRes.arrayBuffer()) };
}

/**
 * Call BEFORE the database is opened. If the local DB file is missing, pull the
 * last backup. Throws if the backup exists/can't be read, so the app never
 * starts with an empty DB and later overwrites a good backup.
 */
export async function restoreDb(dataDir) {
  if (!backupEnabled) {
    console.warn(
      "[db-persist] BACKUP_GITHUB_TOKEN / BACKUP_GITHUB_REPO not set - data will NOT survive a redeploy on ephemeral hosts.",
    );
    return;
  }

  const dbFile = path.join(dataDir, "editprompt.db");
  let lastErr;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const remote = await getRemote();

      if (!remote) {
        console.log("[db-persist] no backup in repo yet - starting fresh");
        restoreSettled = true;
        return;
      }

      remoteSha = remote.sha;

      if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) {
        console.log("[db-persist] local DB already present - keeping it");
        restoreSettled = true;
        return;
      }

      fs.writeFileSync(dbFile, remote.bytes);
      for (const ext of ["-wal", "-shm"]) fs.rmSync(dbFile + ext, { force: true });
      console.log(`[db-persist] restored database from GitHub (${remote.bytes.length} bytes)`);
      restoreSettled = true;
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[db-persist] restore attempt ${attempt} failed:`, err.message);
      await sleep(1500 * attempt);
    }
  }

  throw new Error(
    "[db-persist] could not reach the backup repo - refusing to start with an empty database. " +
      (lastErr?.message || ""),
  );
}

function makeSnapshot(db, dataDir) {
  const tmp = path.join(dataDir, `.snapshot-${process.pid}.db`);
  fs.rmSync(tmp, { force: true });
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);

  // Strip volatile rows so identical data => identical file (no useless commits)
  const snap = new DatabaseSync(tmp);
  try {
    snap.exec("DELETE FROM app_sessions");
    try {
      snap.exec("UPDATE users SET last_seen=NULL");
    } catch {}
    snap.exec("VACUUM");
  } finally {
    snap.close();
  }

  const bytes = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return bytes;
}

async function putRemote(bytes) {
  const body = (sha) =>
    JSON.stringify({
      message: `backup ${new Date().toISOString()}`,
      content: bytes.toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    });

  let res = await fetch(contentsUrl(), {
    method: "PUT",
    headers: headers({ Accept: "application/vnd.github+json", "Content-Type": "application/json" }),
    body: body(remoteSha),
  });

  // sha stale (another instance wrote) -> refetch sha once and retry
  if (res.status === 409 || res.status === 422) {
    const remote = await getRemote().catch(() => null);
    remoteSha = remote?.sha || null;
    res = await fetch(contentsUrl(), {
      method: "PUT",
      headers: headers({ Accept: "application/vnd.github+json", "Content-Type": "application/json" }),
      body: body(remoteSha),
    });
  }

  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  remoteSha = json?.content?.sha || remoteSha;
}

export async function backupNow(db, dataDir, { force = false } = {}) {
  if (!backupEnabled || !restoreSettled) return false;
  if (running) {
    dirty = true;
    return false;
  }
  running = true;
  try {
    const bytes = makeSnapshot(db, dataDir);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!force && hash === lastHash) return false;
    await putRemote(bytes);
    lastHash = hash;
    console.log(`[db-persist] backup saved (${bytes.length} bytes)`);
    return true;
  } catch (err) {
    console.error("[db-persist] backup failed:", err.message);
    return false;
  } finally {
    running = false;
    if (dirty) {
      dirty = false;
      requestBackup();
    }
  }
}

let _db = null;
let _dir = null;

/** Debounced: call after any change. Saves ~20 s later. */
export function requestBackup(delayMs = 20000) {
  if (!backupEnabled || !_db) return;
  clearTimeout(timer);
  timer = setTimeout(() => backupNow(_db, _dir), delayMs);
  timer.unref?.();
}

/** Call once, AFTER the db is open. */
export function startBackups(db, dataDir) {
  if (!backupEnabled) return;
  _db = db;
  _dir = dataDir;

  // first backup shortly after boot, then a safety-net interval
  requestBackup(5000);
  setInterval(() => backupNow(db, dataDir), INTERVAL_MIN * 60 * 1000).unref?.();

  // Render sends SIGTERM on redeploy/stop: save one last time
  let exiting = false;
  const finalSave = async (sig) => {
    if (exiting) return;
    exiting = true;
    console.log(`[db-persist] ${sig} - saving final backup`);
    await backupNow(db, dataDir);
    process.exit(0);
  };
  process.on("SIGTERM", () => finalSave("SIGTERM"));
  process.on("SIGINT", () => finalSave("SIGINT"));
}

/** Express middleware: any successful write request schedules a backup. */
export function backupOnWrites() {
  return (req, res, next) => {
    if (backupEnabled && req.method !== "GET" && req.method !== "HEAD") {
      res.on("finish", () => {
        if (res.statusCode < 400 && !req.path.startsWith("/api/heartbeat")) requestBackup();
      });
    }
    next();
  };
}
