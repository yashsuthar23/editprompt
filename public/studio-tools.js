(() => {
  const $ = (id) => document.getElementById(id);
  const escText = (v) => String(v ?? "").trim();
  const download = (name, text, type = "text/plain;charset=utf-8") => {
    const a = document.createElement("a");
    const u = URL.createObjectURL(new Blob([text], { type }));
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  let sceneText = "",
    reelText = "",
    sourceImage = null,
    sourceName = "image";
  const savedTheme =
    localStorage.getItem("editprompt.creatorStudio.theme") || "dark";
  document.body.dataset.epTheme = savedTheme;
  $("themeToggle").textContent =
    savedTheme === "light" ? "Dark mode" : "Light mode";
  $("themeToggle").addEventListener("click", () => {
    const next = document.body.dataset.epTheme === "light" ? "dark" : "light";
    document.body.dataset.epTheme = next;
    localStorage.setItem("editprompt.creatorStudio.theme", next);
    $("themeToggle").textContent =
      next === "light" ? "Dark mode" : "Light mode";
  });
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
  };
  $("buildScene").addEventListener("click", () => {
    const idea = escText($("sceneIdea").value);
    if (!idea) {
      $("sceneOutput").textContent = "Enter a scene idea first.";
      return;
    }
    const duration = Number($("sceneLength").value),
      format = $("sceneFormat").value,
      count = Math.max(3, Math.min(6, Math.ceil(duration / 7.5)));
    const names = [
      "Opening hook",
      "Establishing shot",
      "Hero action",
      "Detail / emotion",
      "Payoff",
      "Closing CTA",
    ];
    const camera = $("sceneCamera").value,
      lighting = $("sceneLighting").value,
      transition = $("sceneTransition").value,
      voiceover =
        escText($("sceneVoiceover").value) ||
        "No voice-over specified; use natural sound or licensed music.";
    const motions = [
      "Slow push-in; establish the subject and mood",
      "Wide shot; reveal the location and context",
      "Smooth tracking shot; show the main action clearly",
      "Macro close-up; emphasize texture, light and detail",
      "Controlled reveal; deliver the visual payoff",
      "Hold the final composition with clean space for a title",
    ];
    const sceneCards = Array.from({ length: count }, (_, i) => {
      const start = Math.round((i * duration) / count),
        end = Math.round(((i + 1) * duration) / count);
      return `SCENE ${String(i + 1).padStart(2, "0")} · ${names[i] || "Supporting shot"}\nTIMECODE  ${String(start).padStart(2, "0")}–${String(end).padStart(2, "0")} sec (${end - start}s)\n\nVISUAL DIRECTION\n${idea}\n\nCAMERA & MOVEMENT\n${camera}. ${motions[i] || "Smooth cinematic movement; keep subject continuity"}\n\nLIGHTING & LOOK\n${lighting}. Keep exposure and color grade consistent across adjacent shots.\n\nTRANSITION OUT\n${transition}. Choose the cut based on the action and rhythm.\n\nVOICE-OVER / AUDIO\n${voiceover}\n\nCONTINUITY NOTES\nMaintain consistent subject identity, wardrobe, props, screen direction and environment. Avoid abrupt changes.`;
    });
    const outro = `GLOBAL CONTINUITY\nKeep subject identity, environment, color grade and light direction consistent. Use natural motion and avoid unexpected text or logos.\n\nEDITING & DELIVERY NOTES\nFormat: ${format}. Total duration: ${duration}s. Keep titles inside platform-safe margins. Use ${transition.toLowerCase()} where motivated by the action. Add licensed music, captions and a final review in your editor.`;
    sceneText = `SCENE BUILDER STORYBOARD\n\nCONCEPT\n${idea}\n\nDELIVERY SETTINGS\nFormat: ${format}\nTarget duration: ${duration} seconds\nNumber of scenes: ${count}\n\n${sceneCards.join("\n\n────────────────────────\n\n")}\n\n────────────────────────\n\n${outro}`;
    $("sceneOutput").textContent = sceneText;
  });
  $("copyScene").addEventListener("click", () =>
    sceneText
      ? copy(sceneText)
      : ($("sceneOutput").textContent = "Build a storyboard first."),
  );
  $("downloadScene").addEventListener(
    "click",
    () => sceneText && download("editprompt-storyboard.txt", sceneText),
  );
  $("buildReel").addEventListener("click", () => {
    const brand = escText($("brandName").value) || "Your brand",
      product = escText($("productName").value);
    if (!product) {
      $("reelOutput").textContent = "Enter a product or topic first.";
      return;
    }
    const goal = $("reelGoal").value,
      audience = escText($("audience").value) || "your target audience",
      platform = $("reelPlatform").value;
    const hook =
      goal === "sales"
        ? `Still looking for a better way to experience ${product}?`
        : goal === "engagement"
          ? `Which part of ${product} would you try first?`
          : goal === "announcement"
            ? `Something new is here: ${product}.`
            : `Meet ${product} — made with ${audience} in mind.`;
    reelText = `REEL / AD CREATIVE BRIEF\n\nBRAND & CAMPAIGN\nBrand: ${brand}\nTopic: ${product}\nGoal: ${goal}\nAudience: ${audience}\nPlatform / format: ${platform}\nSuggested length: 15–20 seconds\n\n────────────────────────\n\nHOOK  |  0–2 sec\n${hook}\n\nCreative direction\nUse a strong first frame and readable on-screen text. Avoid a long logo intro.\n\n────────────────────────\n\nSCENE PLAN\n\n0–2 sec  |  HOOK\nImmediate visual payoff; show the most interesting detail first.\n\n2–6 sec  |  CONTEXT\nShow the product or topic in context with a clean medium shot.\n\n6–10 sec  |  KEY DETAILS\nUse two quick detail shots to demonstrate a real benefit or feature.\n\n10–14 sec  |  PAYOFF\nShow the outcome or a credible use case.\n\n14–18 sec  |  CALL TO ACTION\nReveal the brand and end with one clear next step.\n\n────────────────────────\n\nCAPTION\n${product} by ${brand}. Discover the details and tell us what you think.\n\n────────────────────────\n\nCTA OPTIONS\n• Learn more\n• Save this for later\n• Share with someone who needs it\n\n────────────────────────\n\nPRODUCTION NOTES\nUse original footage or properly licensed assets, music and fonts. Avoid fake claims, unlicensed celebrity likenesses and copied competitor creatives. Add captions, check safe margins, and review mobile readability before export.\n\n────────────────────────\n\nHASHTAGS\nChoose 3–5 relevant, specific tags for your niche and verify their current relevance before posting.`;
    $("reelOutput").textContent = reelText;
  });
  $("downloadReel").addEventListener("click", () =>
    reelText
      ? download("editprompt-reel-brief.txt", reelText)
      : ($("reelOutput").textContent = "Create a reel brief first."),
  );
  function drawPhoto() {
    if (!sourceImage) return;
    const c = $("photoCanvas"),
      ctx = c.getContext("2d"),
      before = $("originalCanvas"),
      bctx = before.getContext("2d");
    const max = 1800,
      scale = Math.min(1, max / sourceImage.width, max / sourceImage.height);
    const w = Math.round(sourceImage.width * scale),
      h = Math.round(sourceImage.height * scale);
    [c, before].forEach((canvas) => {
      canvas.width = w;
      canvas.height = h;
    });
    bctx.filter = "none";
    bctx.drawImage(sourceImage, 0, 0, w, h);
    ctx.filter = `brightness(${$("brightness").value}%) contrast(${$("contrast").value}%) saturate(${$("saturation").value}%)`;
    ctx.drawImage(sourceImage, 0, 0, w, h);
    ctx.filter = "none";
    $("photoPlaceholder").hidden = true;
    $("editedPlaceholder").hidden = true;
    $("photoStatus").textContent =
      `Before / After comparison: ${w} × ${h}. Original remains unchanged; edits run locally in this browser.`;
  }
  $("photoInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      $("photoStatus").textContent = "Please choose a PNG, JPG or WebP image.";
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      $("photoStatus").textContent = "Maximum file size is 12 MB.";
      return;
    }
    sourceName = f.name.replace(/\.[^.]+$/, "") || "image";
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      drawPhoto();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      $("photoStatus").textContent = "Could not read that image.";
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
  ["brightness", "contrast", "saturation"].forEach((id) =>
    $(id).addEventListener("input", drawPhoto),
  );
  $("resetPhoto").addEventListener("click", () => {
    ["brightness", "contrast", "saturation"].forEach(
      (id) => ($(id).value = 100),
    );
    drawPhoto();
  });
  $("savePhoto").addEventListener("click", () => {
    if (!$("photoCanvas").width) {
      $("photoStatus").textContent = "Choose an image first.";
      return;
    }
    const a = document.createElement("a");
    a.download = `${sourceName}-edited.png`;
    a.href = $("photoCanvas").toDataURL("image/png");
    a.click();
    $("photoStatus").textContent =
      "Edited PNG exported. The original file was not changed.";
  });

  function clearPhoto() {
    sourceImage = null;
    sourceName = "image";
    $("photoInput").value = "";
    [$("originalCanvas"), $("photoCanvas")].forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    });
    ["brightness", "contrast", "saturation"].forEach((id) => { $(id).value = 100; });
    $("photoPlaceholder").hidden = false;
    $("editedPlaceholder").hidden = false;
    $("photoStatus").textContent = "Image cleared. Choose an image to start a new edit.";
  }

  function clearScene() {
    if (!window.confirm("Clear the current storyboard and scene settings?")) return;
    $("sceneIdea").value = "";
    $("sceneFormat").value = "9:16";
    $("sceneLength").value = "15";
    $("sceneCamera").value = "Cinematic mixed coverage";
    $("sceneLighting").value = "Motivated natural lighting";
    $("sceneTransition").value = "Motivated match cuts";
    $("sceneVoiceover").value = "";
    sceneText = "";
    $("sceneOutput").textContent = "Your storyboard will appear here.";
  }

  function clearReel() {
    if (!window.confirm("Clear the current reel brief and its form fields?")) return;
    $("brandName").value = "";
    $("productName").value = "";
    $("reelGoal").value = "awareness";
    $("audience").value = "";
    $("reelPlatform").value = "Instagram Reels / YouTube Shorts · 9:16";
    reelText = "";
    $("reelOutput").textContent = "Your reel brief will appear here.";
  }

  $("clearPhoto").addEventListener("click", clearPhoto);
  $("newScene").addEventListener("click", clearScene);
  $("clearReel").addEventListener("click", clearReel);
})();
