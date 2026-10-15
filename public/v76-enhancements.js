/* EditPrompt V7.6 enhancements: UX, prompt versions, video queue, recovery helpers. */
(() => {
  "use strict";

  const $x = (id) => document.getElementById(id);

  function toastSafe(msg) {
    if (typeof window.toast === "function") window.toast(msg);
    else console.info("[EditPrompt]", msg);
  }

  // Never let an optional enhancement break the main app.
  window.addEventListener("error", (event) => {
    console.error("EditPrompt UI error:", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("EditPrompt unhandled rejection:", event.reason);
  });

  // Prompt version controls already exist in the V7.5 markup; wire them properly.
  async function savePromptVersion() {
    const id = window.__editPromptState?.lastHistoryId;
    const output = typeof window.outputText === "function" ? window.outputText() : ($x("output")?.innerText || "").trim();
    if (!id || !output) return toastSafe("Generate a prompt first.");
    const label = window.prompt("Version name:", "Manual version");
    if (label === null) return;
    try {
      await window.apiRequest(`/api/prompts/${id}/versions`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({prompt: output, label})
      });
      toastSafe("Prompt version saved ✓");
    } catch (e) { toastSafe(e.message || "Could not save version"); }
  }

  async function showPromptVersions() {
    const id = window.__editPromptState?.lastHistoryId;
    if (!id) return toastSafe("Generate a prompt first.");
    try {
      const data = await window.apiRequest(`/api/prompts/${id}/versions`);
      const items = data.items || [];
      if (!items.length) return toastSafe("No saved versions yet.");
      const lines = items.slice(0, 10).map((v, i) => `${i+1}. ${v.label || "Version"} — ${v.created_at}`).join("\n");
      const choice = window.prompt(`${lines}\n\nEnter version number to restore:`);
      if (!choice) return;
      const n = Number(choice);
      const v = items[n - 1];
      if (!v) return toastSafe("Invalid version.");
      if (!confirm(`Restore "${v.label || "Version"}"?`)) return;
      const restored = await window.apiRequest(`/api/prompts/${id}/versions/${v.id}/restore`, {method:"POST"});
      if ($x("output")) $x("output").textContent = restored.prompt;
      toastSafe("Version restored ✓");
    } catch (e) { toastSafe(e.message || "Could not load versions"); }
  }

  $x("savePromptVersionBtn")?.addEventListener("click", savePromptVersion);
  $x("promptVersionsBtn")?.addEventListener("click", showPromptVersions);

  // Add a compact queue panel to the existing media loading step.
  function ensureQueueUI() {
    const loading = $x("mediaStepLoading");
    if (!loading || $x("v76VideoQueue")) return;
    const box = document.createElement("div");
    box.id = "v76VideoQueue";
    box.style.cssText = "margin:14px 0;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(255,255,255,.03);font-size:12px;";
    box.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Video Queue</div><div id="v76QueueStatus" class="muted">Preparing…</div>`;
    loading.insertBefore(box, loading.querySelector("#mediaCancelBtn") || null);
  }

  function queueStatus(text) {
    ensureQueueUI();
    const el = $x("v76QueueStatus");
    if (el) el.textContent = text;
  }

  window.v76QueueStatus = queueStatus;

  // Refresh queue information when the user opens/reloads the app.
  async function refreshQueue() {
    if (!window.apiRequest) return;
    try {
      const data = await window.apiRequest("/api/media/video-jobs?limit=8");
      const active = (data.items || []).filter(j => ["pending","processing"].includes(j.status));
      if (active.length) {
        queueStatus(`${active.length} video job${active.length === 1 ? "" : "s"} active · newest: ${active[0].status}`);
      }
    } catch {}
  }

  // Improve cancellation: actually mark the server-side job cancelled.
  const cancelBtn = $x("mediaCancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      const id = window.__editPromptState?.mediaState?.jobId;
      if (!id || !window.apiRequest) return;
      try {
        await window.apiRequest(`/api/media/video/${id}/cancel`, {method:"POST"});
        queueStatus("Job cancelled.");
      } catch {}
    }, true);
  }

  ensureQueueUI();
  refreshQueue();

  // Make failed video generation recoverable without restarting the app.
  window.v76RetryVideo = async function(jobId) {
    try {
      const data = await window.apiRequest(`/api/media/video/${jobId}/retry`, {method:"POST"});
      toastSafe("Video retry queued.");
      if (window.__editPromptState?.mediaState) {
        window.__editPromptState.mediaState.jobId = data.jobId;
        window.__editPromptState.mediaState.cancelled = false;
        window.__editPromptState.mediaState.polling = false;
      }
      return data.jobId;
    } catch (e) {
      toastSafe(e.message || "Retry failed");
      return null;
    }
  };
  // Small UX upgrades: online status and Ctrl/Cmd+Enter generation shortcut.
  function ensureNetworkBadge() {
    if ($x("v76NetworkBadge")) return;
    const b = document.createElement("div");
    b.id = "v76NetworkBadge";
    b.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9999;padding:7px 10px;border-radius:999px;font:600 11px system-ui;display:none;background:#8a1c1c;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.25);";
    b.textContent = "Offline";
    document.body.appendChild(b);
    const sync = () => {
      b.style.display = navigator.onLine ? "none" : "block";
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    sync();
  }
  ensureNetworkBadge();

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const btn = $x("generateBtn") || $x("generateMediaBtn");
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
  });

})();
