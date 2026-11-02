/* EditPrompt optional Puter.js Text-to-Video provider.
 * Loaded separately so the existing Hugging Face flow remains untouched.
 */
(function () {
  "use strict";

  function durationSeconds(value) {
    const match = String(value || "5 seconds").match(/\d+/);
    return Math.min(15, Math.max(2, match ? Number(match[0]) : 5));
  }

  function videoSize(ratio) {
    const value = String(ratio || "16:9").toLowerCase();
    if (value.includes("9:16") || value.includes("portrait") || value.includes("vertical")) return "720x1280";
    if (value.includes("1:1") || value.includes("square")) return "720x720";
    if (value.includes("4:3")) return "960x720";
    return "1280x720";
  }

  window.editPromptPuterT2V = async function ({ prompt, duration, ratio } = {}) {
    if (!window.puter?.ai?.txt2vid) {
      throw new Error("Puter.js SDK is unavailable. Check your internet connection and refresh.");
    }
    if (!String(prompt || "").trim()) throw new Error("Please enter a video prompt.");

    const video = await window.puter.ai.txt2vid(String(prompt).trim(), {
      model: "togetherai:wan-ai/wan2.7-t2v",
      seconds: durationSeconds(duration),
      size: videoSize(ratio),
      fps: 30,
      generate_audio: true
    });
    const url = video?.src || String(video || "");
    if (!url) throw new Error("Puter returned no video URL.");
    return { url, video };
  };
})();
