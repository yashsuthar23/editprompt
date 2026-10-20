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
  /* The moon/sun icon and the toggle click are handled by /theme.js */
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
  /* Storyboard preview: first ~4 lines, "Show more" expands it on this same page */
  const showStoryboard = (text) => {
    const box = $("sceneOutput");
    const found = box.querySelector(".out-text");
    if (found) {
      found.textContent = text;
      return;
    }
    box.textContent = "";
    const body = document.createElement("div");
    body.className = "out-text is-collapsed";
    body.textContent = text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ghost out-toggle";
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "Show more";
    btn.addEventListener("click", () => {
      const collapsed = body.classList.toggle("is-collapsed");
      btn.textContent = collapsed ? "Show more" : "Show less";
      btn.setAttribute("aria-expanded", String(!collapsed));
    });
    box.append(body, btn);
  };
  /* ================= Scene Builder ================= */
  const pad = (n) => String(n).padStart(2, "0");
  const clamp = (v, lo, hi) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  const RULE = "────────────────────────";
  const SCENE_NAMES = [
    "Opening hook",
    "Establishing shot",
    "Hero action",
    "Detail / emotion",
    "Payoff",
    "Closing CTA",
  ];
  const SCENE_MOTIONS = [
    "Slow push-in; establish the subject and mood",
    "Wide shot; reveal the location and context",
    "Smooth tracking shot; show the main action clearly",
    "Macro close-up; emphasize texture, light and detail",
    "Controlled reveal; deliver the visual payoff",
    "Hold the final composition with clean space for a title",
  ];
  const SHOT_DEFAULTS = [
    "Medium close-up",
    "Wide establishing",
    "Tracking medium",
    "Extreme close-up / macro",
    "Medium wide",
    "Close-up",
  ];
  const GENRES = {
    ad: {
      camera: "Smooth gimbal movement",
      lighting: "Clean high-key lighting",
      transition: "Clean hard cuts",
      format: "9:16",
    },
    travel: {
      camera: "Handheld documentary",
      lighting: "Golden hour backlight",
      transition: "Smooth dissolves",
      format: "9:16",
    },
    wedding: {
      camera: "Cinematic mixed coverage",
      lighting: "Golden hour backlight",
      transition: "Smooth dissolves",
      format: "16:9",
    },
    product: {
      camera: "Macro product detail",
      lighting: "Soft studio lighting",
      transition: "Motivated match cuts",
      format: "1:1",
    },
  };
  let sceneState = null;

  function makeShots(duration, count) {
    return Array.from({ length: count }, (_, i) => ({
      name: SCENE_NAMES[i] || "Supporting shot",
      shot: SHOT_DEFAULTS[i] || "Medium",
      start: Math.round((i * duration) / count),
      end: Math.round(((i + 1) * duration) / count),
      motion:
        SCENE_MOTIONS[i] ||
        "Smooth cinematic movement; keep subject continuity",
    }));
  }

  function renderScene() {
    const s = sceneState;
    if (!s) return;
    const cards = s.shots.map(
      (sh, i) =>
        `SHOT ${pad(i + 1)} · ${sh.name}\nTIMECODE  ${pad(sh.start)}–${pad(sh.end)} sec (${sh.end - sh.start}s)\nSHOT TYPE  ${sh.shot}\n\nVISUAL DIRECTION\n${s.idea}\n\nCAMERA & MOVEMENT\n${s.camera}. ${sh.motion}\n\nLIGHTING & LOOK\n${s.lighting}. Keep exposure and color grade consistent across adjacent shots.\n\nTRANSITION OUT\n${s.transition}. Choose the cut based on the action and rhythm.\n\nVOICE-OVER / AUDIO\n${s.voiceover}\n\nCONTINUITY NOTES\nMaintain consistent subject identity, wardrobe, props, screen direction and environment. Avoid abrupt changes.`,
    );
    const outro = `GLOBAL CONTINUITY\nKeep subject identity, environment, color grade and light direction consistent. Use natural motion and avoid unexpected text or logos.\n\nEDITING & DELIVERY NOTES\nFormat: ${s.format}. Total duration: ${s.duration}s. Keep titles inside platform-safe margins. Use ${s.transition.toLowerCase()} where motivated by the action. Add licensed music, captions and a final review in your editor.`;
    sceneText = `SCENE BUILDER STORYBOARD\n\nCONCEPT\n${s.idea}\n\nDELIVERY SETTINGS\nFormat: ${s.format}\nTarget duration: ${s.duration} seconds\nNumber of shots: ${s.shots.length}\n\n${cards.join(`\n\n${RULE}\n\n`)}\n\n${RULE}\n\n${outro}`;
    showStoryboard(sceneText);
  }

  function shotCsv() {
    const s = sceneState;
    const rows = [
      [
        "Shot",
        "Name",
        "Shot type",
        "Start (s)",
        "End (s)",
        "Duration (s)",
        "Camera & movement",
        "Lighting",
        "Transition out",
      ],
    ];
    s.shots.forEach((sh, i) =>
      rows.push([
        i + 1,
        sh.name,
        sh.shot,
        sh.start,
        sh.end,
        sh.end - sh.start,
        `${s.camera}. ${sh.motion}`,
        s.lighting,
        s.transition,
      ]),
    );
    return rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
  }

  $("sceneGenre").addEventListener("change", () => {
    const g = GENRES[$("sceneGenre").value];
    if (!g) return;
    pushSceneHistory();
    $("sceneCamera").value = g.camera;
    $("sceneLighting").value = g.lighting;
    $("sceneTransition").value = g.transition;
    $("sceneFormat").value = g.format;
  });

  $("buildScene").addEventListener("click", () => {
    pushSceneHistory();
    const idea = escText($("sceneIdea").value);
    if (!idea) {
      sceneState = null;
      $("sceneOutput").textContent = "Enter a scene idea first.";
      return;
    }
    const duration = Number($("sceneLength").value),
      count = Math.max(3, Math.min(6, Math.ceil(duration / 7.5)));
    sceneState = {
      idea,
      format: $("sceneFormat").value,
      duration,
      camera: $("sceneCamera").value,
      lighting: $("sceneLighting").value,
      transition: $("sceneTransition").value,
      voiceover:
        escText($("sceneVoiceover").value) ||
        "No voice-over specified; use natural sound or licensed music.",
      shots: makeShots(duration, count),
    };
    renderScene();
    saveRecent("Storyboard", idea, sceneText);
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
  $("csvScene").addEventListener("click", () =>
    sceneState
      ? download(
          "editprompt-shot-list.csv",
          "\uFEFF" + shotCsv(),
          "text/csv;charset=utf-8",
        )
      : ($("sceneOutput").textContent = "Build a storyboard first."),
  );
  /* Print uses a separate block appended to <body>; the on-screen layout is never printed */
  $("printScene").addEventListener("click", () => {
    if (!sceneState) {
      $("sceneOutput").textContent = "Build a storyboard first.";
      return;
    }
    let area = document.getElementById("printArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "printArea";
      area.setAttribute("aria-hidden", "true");
      document.body.appendChild(area);
    }
    area.textContent = sceneText;
    /* the browser prints document.title as the page header while printing */
    const prevTitle = document.title;
    document.title = "EditPrompt";
    window.addEventListener(
      "afterprint",
      () => {
        document.title = prevTitle;
      },
      { once: true },
    );
    window.print();
  });
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
    $("captionEdit").value =
      `${product} by ${brand}. Discover the details and tell us what you think.`;
    updateCaptionCount();
    runCaptionChecks();
    saveRecent("Reel brief", product, reelText);
  });
  $("downloadReel").addEventListener("click", () =>
    reelText
      ? download("editprompt-reel-brief.txt", reelText)
      : ($("reelOutput").textContent = "Create a reel brief first."),
  );
  /* keep the sticky preview just below the (sticky) site header, whatever its height */
  const peSyncNav = () => {
    const nav = document.querySelector("header.nav");
    if (nav)
      document.documentElement.style.setProperty(
        "--nav-h",
        nav.getBoundingClientRect().height + "px",
      );
  };
  peSyncNav();
  window.addEventListener("resize", peSyncNav);
  window.addEventListener("load", peSyncNav);

  /* ================= Photo Editor Pro ================= */
  const PE_IDS = [
    "brightness",
    "contrast",
    "saturation",
    "hue",
    "blur",
    "sepia",
    "gray",
    "cropZoom",
    "cropX",
    "cropY",
  ];
  const PE_DEFAULTS = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    sepia: 0,
    gray: 0,
    cropZoom: 100,
    cropX: 50,
    cropY: 50,
  };
  const PE_FILTER_IDS = [
    "brightness",
    "contrast",
    "saturation",
    "hue",
    "blur",
    "sepia",
    "gray",
  ];
  const PE_PRESETS = {
    original: {},
    cinematic: {
      brightness: 95,
      contrast: 122,
      saturation: 88,
      sepia: 12,
      hue: -6,
    },
    warm: {
      brightness: 104,
      contrast: 106,
      saturation: 115,
      sepia: 22,
      hue: -8,
    },
    cool: { brightness: 102, contrast: 105, saturation: 92, hue: 14 },
    bw: { contrast: 118, gray: 100 },
    vintage: { brightness: 106, contrast: 90, saturation: 78, sepia: 45 },
    tealorange: { brightness: 98, contrast: 116, saturation: 130, hue: 8 },
  };
  const PE_RATIOS = {
    orig: null,
    "1:1": 1,
    "4:5": 4 / 5,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "3:2": 3 / 2,
  };
  const WM_DEFAULT = { t: "", p: "br", s: "5", o: "80", c: "#ffffff" };
  let tf = { rot: 0, flipH: false, flipV: false };
  let baseCanvas = null,
    baseKey = "";
  let undoStack = [],
    redoStack = [],
    lastSnap = null;

  const peSnapshot = () =>
    JSON.stringify({
      tf,
      ratio: $("cropRatio").value,
      v: PE_IDS.reduce((o, id) => ((o[id] = +$(id).value), o), {}),
      wm: wmState(),
    });
  function peHistoryButtons() {
    $("undoPhoto").disabled = undoStack.length === 0;
    $("redoPhoto").disabled = redoStack.length === 0;
  }
  function peCommit() {
    if (!sourceImage) return;
    const snap = peSnapshot();
    if (snap === lastSnap) return;
    undoStack.push(lastSnap);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    lastSnap = snap;
    peHistoryButtons();
  }
  function peApply(snap) {
    const o = JSON.parse(snap);
    tf = { ...o.tf };
    $("cropRatio").value = o.ratio;
    PE_IDS.forEach((id) => ($(id).value = o.v[id]));
    applyWm(o.wm);
    peMarkPreset(null);
    drawPhoto();
  }
  function undoPhoto() {
    if (!sourceImage || !undoStack.length) return;
    redoStack.push(lastSnap);
    lastSnap = undoStack.pop();
    peApply(lastSnap);
    peHistoryButtons();
  }
  function redoPhoto() {
    if (!sourceImage || !redoStack.length) return;
    undoStack.push(lastSnap);
    lastSnap = redoStack.pop();
    peApply(lastSnap);
    peHistoryButtons();
  }
  function peMarkPreset(name) {
    document
      .querySelectorAll("#photoPresets [data-preset]")
      .forEach((b) => b.classList.toggle("on", b.dataset.preset === name));
  }
  function peResetValues() {
    PE_IDS.forEach((id) => ($(id).value = PE_DEFAULTS[id]));
    $("cropRatio").value = "orig";
    tf = { rot: 0, flipH: false, flipV: false };
    applyWm(null);
    baseCanvas = null;
    peMarkPreset(null);
  }

  /* rotated / flipped working copy, scaled so the longest side is <= 1800px */
  function getBase() {
    const key = `${tf.rot}|${tf.flipH}|${tf.flipV}`;
    if (baseCanvas && baseKey === key) return baseCanvas;
    const swap = tf.rot % 180 !== 0;
    const W = swap ? sourceImage.height : sourceImage.width;
    const H = swap ? sourceImage.width : sourceImage.height;
    const scale = Math.min(1, 1800 / W, 1800 / H);
    const tw = Math.max(1, Math.round(W * scale)),
      th = Math.max(1, Math.round(H * scale));
    const dw = sourceImage.width * scale,
      dh = sourceImage.height * scale;
    const t = document.createElement("canvas");
    t.width = tw;
    t.height = th;
    const x = t.getContext("2d");
    x.translate(tw / 2, th / 2);
    x.scale(tf.flipH ? -1 : 1, tf.flipV ? -1 : 1);
    x.rotate((tf.rot * Math.PI) / 180);
    x.drawImage(sourceImage, -dw / 2, -dh / 2, dw, dh);
    baseCanvas = t;
    baseKey = key;
    return t;
  }
  function peCropRect(t) {
    const r = PE_RATIOS[$("cropRatio").value];
    let cw = t.width,
      ch = t.height;
    if (r) {
      if (t.width / t.height > r) cw = t.height * r;
      else ch = t.width / r;
    }
    const z = Math.max(1, +$("cropZoom").value / 100);
    cw /= z;
    ch /= z;
    return {
      cw,
      ch,
      cx: (t.width - cw) * (+$("cropX").value / 100),
      cy: (t.height - ch) * (+$("cropY").value / 100),
    };
  }
  const peFilter = () =>
    `brightness(${$("brightness").value}%) contrast(${$("contrast").value}%) saturate(${$("saturation").value}%) ` +
    `hue-rotate(${$("hue").value}deg) blur(${$("blur").value}px) sepia(${$("sepia").value}%) grayscale(${$("gray").value}%)`;

  function drawPhoto() {
    if (!sourceImage) return;
    const t = getBase(),
      { cx, cy, cw, ch } = peCropRect(t);
    const w = Math.max(1, Math.round(cw)),
      h = Math.max(1, Math.round(ch));
    const c = $("photoCanvas"),
      before = $("originalCanvas");
    [c, before].forEach((cv) => {
      cv.width = w;
      cv.height = h;
    });
    const bctx = before.getContext("2d"),
      ctx = c.getContext("2d");
    bctx.filter = "none";
    bctx.drawImage(t, cx, cy, cw, ch, 0, 0, w, h);
    ctx.filter = peFilter();
    ctx.drawImage(t, cx, cy, cw, ch, 0, 0, w, h);
    ctx.filter = "none";
    drawWatermark(ctx, w, h);
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
      peResetValues();
      undoStack = [];
      redoStack = [];
      drawPhoto();
      lastSnap = peSnapshot();
      peHistoryButtons();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      $("photoStatus").textContent = "Could not read that image.";
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  /* sliders: live preview on input, one undo step on release */
  PE_IDS.forEach((id) => {
    $(id).addEventListener("input", () => {
      peMarkPreset(null);
      drawPhoto();
    });
    $(id).addEventListener("change", peCommit);
  });
  $("cropRatio").addEventListener("change", () => {
    drawPhoto();
    peCommit();
  });

  const needImage = () => {
    if (sourceImage) return true;
    $("photoStatus").textContent = "Choose an image first.";
    return false;
  };
  const peTransform = (fn) => () => {
    if (!needImage()) return;
    fn();
    drawPhoto();
    peCommit();
  };
  $("rotLeft").addEventListener(
    "click",
    peTransform(() => {
      tf.rot = (tf.rot + 270) % 360;
    }),
  );
  $("rotRight").addEventListener(
    "click",
    peTransform(() => {
      tf.rot = (tf.rot + 90) % 360;
    }),
  );
  $("flipH").addEventListener(
    "click",
    peTransform(() => {
      tf.flipH = !tf.flipH;
    }),
  );
  $("flipV").addEventListener(
    "click",
    peTransform(() => {
      tf.flipV = !tf.flipV;
    }),
  );
  $("undoPhoto").addEventListener("click", undoPhoto);
  $("redoPhoto").addEventListener("click", redoPhoto);

  document.querySelectorAll("#photoPresets [data-preset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (!needImage()) return;
      PE_FILTER_IDS.forEach((id) => ($(id).value = PE_DEFAULTS[id]));
      Object.entries(PE_PRESETS[btn.dataset.preset] || {}).forEach(
        ([id, v]) => ($(id).value = v),
      );
      drawPhoto();
      peCommit();
      peMarkPreset(btn.dataset.preset);
    }),
  );

  $("resetPhoto").addEventListener("click", () => {
    if (!needImage()) return;
    peResetValues();
    drawPhoto();
    peCommit();
  });

  document.addEventListener("keydown", (e) => {
    if (!sourceImage || !(e.ctrlKey || e.metaKey)) return;
    const el = e.target,
      tag = el.tagName;
    if (
      tag === "TEXTAREA" ||
      (tag === "INPUT" && !["range", "file"].includes(el.type))
    )
      return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      undoPhoto();
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      redoPhoto();
    }
  });

  /* export: PNG / JPG / WebP */
  const syncQuality = () => {
    $("photoQualityWrap").hidden = $("photoFormat").value === "png";
    $("photoQualityVal").textContent = $("photoQuality").value;
  };
  $("photoFormat").addEventListener("change", syncQuality);
  $("photoQuality").addEventListener("input", syncQuality);
  syncQuality();
  $("savePhoto").addEventListener("click", () => {
    const src = $("photoCanvas");
    if (!src.width) {
      $("photoStatus").textContent = "Choose an image first.";
      return;
    }
    const fmt = $("photoFormat").value;
    const mime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[
      fmt
    ];
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    /* social export size: cover-fit the edited image (centre crop) to the chosen size */
    const EXPORT_SIZES = {
      "1:1": [1080, 1080],
      "4:5": [1080, 1350],
      "9:16": [1080, 1920],
      "16:9": [1920, 1080],
      fb: [1200, 630],
    };
    const preset = EXPORT_SIZES[$("exportPreset").value];
    let base = src;
    if (preset) {
      base = document.createElement("canvas");
      base.width = preset[0];
      base.height = preset[1];
      const bx = base.getContext("2d");
      const s = Math.max(preset[0] / src.width, preset[1] / src.height);
      const dw = src.width * s,
        dh = src.height * s;
      bx.drawImage(src, (preset[0] - dw) / 2, (preset[1] - dh) / 2, dw, dh);
    }
    let out = base;
    if (fmt === "jpeg") {
      /* JPG has no transparency: put the image on white */
      out = document.createElement("canvas");
      out.width = base.width;
      out.height = base.height;
      const x = out.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, out.width, out.height);
      x.drawImage(base, 0, 0);
    }
    out.toBlob(
      (blob) => {
        if (!blob) {
          $("photoStatus").textContent =
            `Your browser could not export ${ext.toUpperCase()}. Try PNG or JPG.`;
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `${sourceName}-edited.${ext}`;
        a.href = url;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        $("photoStatus").textContent =
          `Exported ${ext.toUpperCase()} · ${out.width} × ${out.height} · ${Math.round(blob.size / 1024)} KB. The original file was not changed. Location and camera metadata are not copied.`;
        saveRecent(
          "Photo export",
          `${sourceName}-edited.${ext}`,
          `Exported ${sourceName}-edited.${ext} (${out.width} × ${out.height}). Image data is not stored in Project Library.`,
        );
      },
      mime,
      fmt === "png" ? undefined : +$("photoQuality").value / 100,
    );
  });

  function clearPhoto() {
    sourceImage = null;
    sourceName = "image";
    baseCanvas = null;
    undoStack = [];
    redoStack = [];
    lastSnap = null;
    $("photoInput").value = "";
    [$("originalCanvas"), $("photoCanvas")].forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    });
    peResetValues();
    peHistoryButtons();
    $("photoPlaceholder").hidden = false;
    $("editedPlaceholder").hidden = false;
    $("photoStatus").textContent =
      "Image cleared. Choose an image to start a new edit.";
  }

  function clearScene() {
    if (!window.confirm("Clear the current storyboard and scene settings?"))
      return;
    $("sceneIdea").value = "";
    $("sceneFormat").value = "9:16";
    $("sceneLength").value = "15";
    $("sceneCamera").value = "Cinematic mixed coverage";
    $("sceneLighting").value = "Motivated natural lighting";
    $("sceneTransition").value = "Motivated match cuts";
    $("sceneVoiceover").value = "";
    sceneText = "";
    sceneState = null;
    $("sceneGenre").value = "custom";
    $("sceneOutput").textContent = "Your storyboard will appear here.";
  }

  function clearReel() {
    if (!window.confirm("Clear the current reel brief and its form fields?"))
      return;
    $("brandName").value = "";
    $("productName").value = "";
    $("reelGoal").value = "awareness";
    $("audience").value = "";
    $("reelPlatform").value = "Instagram Reels / YouTube Shorts · 9:16";
    reelText = "";
    $("reelOutput").textContent = "Your reel brief will appear here.";
  }

  /* ===== shared helpers for the new features ===== */
  const LOOK_KEY = "editprompt.creatorStudio.looks";
  const RECENT_KEY = "editprompt.creatorStudio.recent";
  const readJSON = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  };
  const writeJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode): the feature still works for this session */
    }
  };
  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  const showList = (box, rows) => {
    box.textContent = "";
    box.hidden = false;
    rows.forEach((r) => box.appendChild(r));
  };
  const copyRow = (text) => {
    const row = document.createElement("div");
    row.className = "recent-row";
    const span = document.createElement("span");
    span.textContent = text;
    row.append(
      span,
      mkBtn("Copy", () => copy(text)),
    );
    return row;
  };

  /* ===== Recent items (Project Library) ===== */
  function saveRecent(kind, title, text) {
    const list = [
      {
        kind,
        title: String(title || "Untitled").slice(0, 60),
        text: String(text).slice(0, 40000),
        status: "Draft",
        at: new Date().toISOString(),
      },
      ...readJSON(RECENT_KEY),
    ].slice(0, 10);
    writeJSON(RECENT_KEY, list);
    renderRecent();
  }
  /* ===== Photo: text / watermark ===== */
  function wmState() {
    return {
      t: $("wmText").value,
      p: $("wmPos").value,
      s: $("wmSize").value,
      o: $("wmOpacity").value,
      c: $("wmColor").value,
    };
  }
  function applyWm(w) {
    const d = w || WM_DEFAULT;
    $("wmText").value = d.t;
    $("wmPos").value = d.p;
    $("wmSize").value = d.s;
    $("wmOpacity").value = d.o;
    $("wmColor").value = d.c;
  }
  function drawWatermark(ctx, w, h) {
    const text = escText($("wmText").value);
    if (!text) return;
    const size = Math.max(
      12,
      Math.round((Math.min(w, h) * +$("wmSize").value) / 100),
    );
    const pad2 = Math.round(size * 0.8);
    const pos = $("wmPos").value;
    ctx.save();
    ctx.globalAlpha = +$("wmOpacity").value / 100;
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = $("wmColor").value;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = size * 0.3;
    const tw = ctx.measureText(text).width;
    let x, y;
    if (pos === "c") {
      x = (w - tw) / 2;
      y = h / 2;
    } else {
      x = pos.endsWith("l") ? pad2 : w - pad2 - tw;
      y = pos.startsWith("t") ? pad2 : h - pad2;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ["wmText", "wmPos", "wmSize", "wmOpacity", "wmColor"].forEach((id) => {
    $(id).addEventListener("input", () => drawPhoto());
    $(id).addEventListener("change", peCommit);
  });

  /* ===== Photo: saved looks (filter values only, stored in this browser) ===== */
  function renderLooks(selectValue) {
    const sel = $("savedLooks"),
      looks = readJSON(LOOK_KEY);
    sel.textContent = "";
    if (!looks.length) {
      sel.add(new Option("— none yet —", ""));
      return;
    }
    looks.forEach((l, i) => sel.add(new Option(l.name, String(i))));
    if (selectValue !== undefined) sel.value = selectValue;
  }
  $("saveLook").addEventListener("click", () => {
    if (!needImage()) return;
    const name = (
      window.prompt("Name this look (for example: Summer warm)", "") || ""
    )
      .trim()
      .slice(0, 40);
    if (!name) return;
    const looks = readJSON(LOOK_KEY).filter((l) => l.name !== name);
    looks.push({
      name,
      filters: PE_FILTER_IDS.reduce((o, id) => ((o[id] = +$(id).value), o), {}),
    });
    writeJSON(LOOK_KEY, looks);
    renderLooks(String(looks.length - 1));
    $("photoStatus").textContent = `Saved look "${name}" in this browser.`;
  });
  $("applyLook").addEventListener("click", () => {
    if (!needImage()) return;
    const v = $("savedLooks").value;
    const look = v === "" ? null : readJSON(LOOK_KEY)[+v];
    if (!look) {
      $("photoStatus").textContent = "Choose a saved look first.";
      return;
    }
    PE_FILTER_IDS.forEach(
      (id) => ($(id).value = look.filters[id] ?? PE_DEFAULTS[id]),
    );
    peMarkPreset(null);
    drawPhoto();
    peCommit();
    $("photoStatus").textContent = `Applied "${look.name}".`;
  });
  $("deleteLook").addEventListener("click", () => {
    const v = $("savedLooks").value;
    if (v === "") return;
    const looks = readJSON(LOOK_KEY);
    const removed = looks.splice(+v, 1)[0];
    writeJSON(LOOK_KEY, looks);
    renderLooks();
    $("photoStatus").textContent = removed ? `Deleted "${removed.name}".` : "";
  });

  /* ===== Photo: before / after slider ===== */
  let baOn = false;
  const setSplit = () =>
    $("compareGrid").style.setProperty("--split", $("baSplit").value + "%");
  $("baToggle").addEventListener("click", () => {
    baOn = !baOn;
    $("compareGrid").classList.toggle("ba-on", baOn);
    $("baToggle").textContent = baOn ? "Show side by side" : "Show slider view";
    $("baToggle").setAttribute("aria-pressed", String(baOn));
    if (baOn)
      $("photoStatus").textContent =
        "Slider view: left side is the edited image, right side is the original.";
    setSplit();
  });
  $("baSplit").addEventListener("input", setSplit);

  /* ===== Reel & Ad extras ===== */
  const captionLimit = () =>
    $("reelPlatform").value.startsWith("YouTube") ? 5000 : 2200;
  function updateCaptionCount() {
    const n = $("captionEdit").value.length,
      lim = captionLimit(),
      el = $("captionCount");
    el.textContent = `${n} / ${lim} characters${n > lim ? " · too long for this format" : ""}`;
    el.style.color = n > lim ? "#e52329" : "";
  }
  $("captionEdit").addEventListener("input", updateCaptionCount);
  $("reelPlatform").addEventListener("change", updateCaptionCount);
  $("copyCaption").addEventListener("click", () =>
    copy($("captionEdit").value),
  );
  /* ===== Hashtag suggestions: built from product, brand, audience, goal and platform ===== */
  const HASHTAG_STOP = new Set([
    "the",
    "and",
    "for",
    "with",
    "your",
    "you",
    "our",
    "this",
    "that",
    "from",
    "new",
    "are",
    "was",
    "all",
  ]);
  const HASHTAG_GOAL = {
    awareness: ["#newbrand", "#smallbusiness"],
    sales: ["#shopnow", "#onlineshopping"],
    engagement: ["#reelsvideo", "#contentcreator"],
    announcement: ["#launchday", "#comingsoon"],
  };
  function hashtagsForPlatform(p) {
    if (p.startsWith("YouTube")) return ["#youtube", "#youtubevideo"];
    if (p.startsWith("Square")) return ["#instagram", "#instadaily"];
    if (p.startsWith("Facebook")) return ["#facebook", "#facebookreels"];
    return ["#reels", "#instagramreels", "#shorts"];
  }
  const hashWords = (s) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !HASHTAG_STOP.has(w));

  function buildHashtagGroups() {
    const product = escText($("productName").value),
      brand = escText($("brandName").value),
      audience = escText($("audience").value),
      goal = $("reelGoal").value,
      platform = $("reelPlatform").value;
    const groups = [];
    const productTags = [...new Set(hashWords(product))]
      .slice(0, 3)
      .map((w) => "#" + w);
    const joined = hashWords(product).join("");
    if (hashWords(product).length > 1 && joined.length <= 30)
      productTags.unshift("#" + joined);
    const brandTag = hashWords(brand).join("")
      ? ["#" + hashWords(brand).join("")]
      : [];
    groups.push({
      label: "Product & brand",
      tags: [...productTags, ...brandTag],
    });
    const audienceTags = [...new Set(hashWords(audience))]
      .slice(0, 2)
      .map((w) => "#" + w);
    groups.push({
      label: "Audience & goal",
      tags: [...audienceTags, ...(HASHTAG_GOAL[goal] || [])],
    });
    groups.push({
      label: "Platform & broad",
      tags: [...hashtagsForPlatform(platform), "#contentcreator"],
    });
    const seen = new Set();
    return groups
      .map((g) => ({
        ...g,
        tags: g.tags
          .filter((t) => t.length > 2 && !seen.has(t) && seen.add(t))
          .slice(0, 5),
      }))
      .filter((g) => g.tags.length);
  }

  const tagChip = (tag, onChange) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-chip";
    b.textContent = tag;
    b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => {
      b.setAttribute(
        "aria-pressed",
        String(b.getAttribute("aria-pressed") !== "true"),
      );
      onChange();
    });
    return b;
  };

  $("hashtagBtn").addEventListener("click", () => {
    const box = $("hashtagOutput");
    const groups =
      escText($("productName").value) || escText($("brandName").value)
        ? buildHashtagGroups()
        : [];
    if (!groups.length) {
      box.hidden = false;
      box.textContent = "Enter a product or brand name to get hashtag ideas.";
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "hashtag-wrap";
    const status = document.createElement("div");
    status.className = "status";
    const chips = [];
    const refresh = () => {
      const picked = chips.filter(
        (c) => c.getAttribute("aria-pressed") === "true",
      );
      status.textContent = `${picked.length} of ${chips.length} selected. Tap a tag to include or drop it.`;
      copyBtn.disabled = picked.length === 0;
    };
    groups.forEach((g) => {
      const label = document.createElement("div");
      label.className = "status pe-title";
      label.textContent = g.label;
      const row = document.createElement("div");
      row.className = "tag-row";
      g.tags.forEach((t) => {
        const c = tagChip(t, refresh);
        chips.push(c);
        row.appendChild(c);
      });
      wrap.append(label, row);
    });
    const copyBtn = mkBtn("Copy selected", () => {
      const picked = chips
        .filter((c) => c.getAttribute("aria-pressed") === "true")
        .map((c) => c.textContent);
      copy(picked.join(" "));
      status.textContent = `Copied ${picked.length} hashtags.`;
    });
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(copyBtn);
    actions.appendChild(
      mkBtn("Add to caption", () => {
        const picked = chips
          .filter((c) => c.getAttribute("aria-pressed") === "true")
          .map((c) => c.textContent);
        if (!picked.length) return;
        const cur = $("captionEdit").value.trimEnd();
        $("captionEdit").value = (cur ? cur + "\n\n" : "") + picked.join(" ");
        updateCaptionCount();
        runCaptionChecks();
        status.textContent = `Added ${picked.length} hashtags to the caption.`;
      }),
    );
    wrap.append(status, actions);
    box.textContent = "";
    box.hidden = false;
    box.appendChild(wrap);
    refresh();
  });

  /* ===== Keyboard: Ctrl/Cmd+Enter builds the active tool ===== */
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
    const id = document.activeElement?.id;
    if (id === "sceneIdea" || id === "sceneVoiceover") {
      e.preventDefault();
      $("buildScene").click();
    } else if (["brandName", "productName", "audience"].includes(id)) {
      e.preventDefault();
      $("buildReel").click();
    }
  });

  /* ===== Scene Builder: undo / redo ===== */
  const SCENE_INPUTS = [
    "sceneGenre",
    "sceneIdea",
    "sceneLength",
    "sceneFormat",
    "sceneCamera",
    "sceneLighting",
    "sceneTransition",
    "sceneVoiceover",
  ];
  const sceneHistory = { past: [], future: [] };
  const snapScene = () => {
    const s = sceneState;
    const inputs = SCENE_INPUTS.reduce(
      (o, id) => ((o[id] = $(id).value), o),
      {},
    );
    // when a storyboard exists, its own settings are what the snapshot should restore,
    // not whatever has been typed into the boxes since
    if (s)
      Object.assign(inputs, {
        sceneIdea: s.idea,
        sceneLength: String(s.duration),
        sceneFormat: s.format,
        sceneCamera: s.camera,
        sceneLighting: s.lighting,
        sceneTransition: s.transition,
      });
    return {
      inputs,
      state: s ? JSON.parse(JSON.stringify(s)) : null,
      text: sceneText,
    };
  };
  function pushSceneHistory() {
    sceneHistory.past.push(snapScene());
    if (sceneHistory.past.length > 30) sceneHistory.past.shift();
    sceneHistory.future = [];
  }
  function restoreScene(snap) {
    SCENE_INPUTS.forEach((id) => ($(id).value = snap.inputs[id]));
    sceneState = snap.state ? JSON.parse(JSON.stringify(snap.state)) : null;
    sceneText = snap.text || "";
    if (sceneText) showStoryboard(sceneText);
    else $("sceneOutput").textContent = "Your storyboard will appear here.";
  }
  $("sceneUndo").addEventListener("click", () => {
    const prev = sceneHistory.past.pop();
    if (!prev) {
      $("sceneOutput").textContent = "Nothing to undo.";
      return;
    }
    sceneHistory.future.push(snapScene());
    restoreScene(prev);
  });
  $("sceneRedo").addEventListener("click", () => {
    const next = sceneHistory.future.pop();
    if (!next) {
      $("sceneOutput").textContent = "Nothing to redo.";
      return;
    }
    sceneHistory.past.push(snapScene());
    restoreScene(next);
  });

  /* ===== Reel: platform-specific caption tips (guidance, not guarantees) ===== */
  function updatePlatformTip() {
    const p = $("reelPlatform").value;
    let tip =
      "Reels and Shorts: put the hook in the first line, keep it to 1–2 short lines, and add a few relevant hashtags.";
    if (p.startsWith("YouTube"))
      tip =
        "YouTube landscape: open with a 2–3 sentence summary that names the topic clearly, since search uses titles and descriptions.";
    else if (p.startsWith("Square"))
      tip =
        "Square post: lead with a question or a clear benefit; the first line is what people see before “more”.";
    else if (p.startsWith("Facebook"))
      tip =
        "Facebook: a short story or question works well; keep the first 1–2 sentences clear and friendly.";
    $("platformTip").textContent = tip;
  }
  $("reelPlatform").addEventListener("change", updatePlatformTip);

  /* ===== Reel: thumbnail title ideas (3–5 words) ===== */
  $("thumbBtn").addEventListener("click", () => {
    const box = $("thumbOutput"),
      product = escText($("productName").value);
    if (!product) {
      box.hidden = false;
      box.textContent = "Enter a product or topic first.";
      return;
    }
    const short = product.split(/\s+/).slice(0, 3).join(" ");
    const last =
      $("reelGoal").value === "sales"
        ? `Get ${short} today`
        : `The ${short} truth`;
    showList(box, [
      copyRow(`${short}: 15 seconds`),
      copyRow(`Why ${short}?`),
      copyRow(last),
    ]);
  });

  /* ===== Brand preview card (PNG, drawn on canvas, nothing uploaded) ===== */
  const CARD_FONT = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) =>
      Math.round(v * f)
        .toString(16)
        .padStart(2, "0");
    return "#" + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
  };
  function wrapCanvasLines(ctx, text, maxW) {
    const lines = [];
    let cur = "";
    text.split(/\s+/).forEach((w) => {
      const next = cur ? cur + " " + w : w;
      if (ctx.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function cardSpec(platform) {
    if (platform.startsWith("YouTube"))
      return { W: 1280, H: 720, badge: "YouTube · 16:9" };
    if (platform.startsWith("Square"))
      return { W: 1080, H: 1080, badge: "Square · 1:1" };
    if (platform.startsWith("Facebook"))
      return { W: 1080, H: 1350, badge: "Facebook · 4:5" };
    return { W: 1080, H: 1920, badge: "Reels · Shorts · 9:16" };
  }
  function fitText(ctx, text, weight, startSize, maxW, minSize) {
    let size = startSize;
    do {
      ctx.font = `${weight} ${size}px ${CARD_FONT}`;
      if (ctx.measureText(text).width <= maxW) return { text, size };
      size -= 2;
    } while (size > minSize);
    ctx.font = `${weight} ${minSize}px ${CARD_FONT}`;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW)
      t = t.slice(0, -1);
    return { text: t + "…", size: minSize };
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function drawBrandCard() {
    const status = $("cardStatus"),
      canvas = $("brandCard");
    const platform = $("reelPlatform").value;
    const { W, H, badge } = cardSpec(platform);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) {
      status.textContent =
        "This browser cannot draw the card. Try a current Chrome, Edge or Firefox.";
      return false;
    }
    const brand = readBrand();
    const name = escText($("brandName").value) || brand.name || "Your brand";
    const color = brand.color || "#e5233a";
    const product = escText($("productName").value);
    const captionLine = escText($("captionEdit").value).split("\n")[0];
    const headline = (product || captionLine || "Your headline").slice(0, 90);
    const goalKey = $("reelGoal").value;
    const goal = $("reelGoal").options[$("reelGoal").selectedIndex]?.text || "";
    const CTA = {
      sales: "Shop now",
      engagement: "Join the conversation",
      announcement: "Learn more",
      awareness: "Follow for more",
    };
    const cta = CTA[goalKey] || "Learn more";
    const light = luminance(color) > 0.6;
    const fg = light ? "#111111" : "#ffffff";
    const u = Math.min(W, H);
    const pad = Math.round(u * 0.075);
    const wide = W > H;

    // background: diagonal gradient plus two soft decorative circles
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.arc(W * 0.92, H * 0.12, u * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W * 0.05, H * 0.95, u * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // header: round logo mark with the first letter, then the brand name (always fits, never overlaps)
    const logo = Math.round(u * 0.085),
      headerY = pad;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(pad + logo / 2, headerY + logo / 2, logo / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light ? "#ffffff" : shade(color, 0.6);
    ctx.font = `800 ${Math.round(logo * 0.55)}px ${CARD_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      (name.trim()[0] || "B").toUpperCase(),
      pad + logo / 2,
      headerY + logo * 0.69,
    );
    ctx.textAlign = "left";
    const nameX = pad + logo + Math.round(u * 0.025);
    const fitted = fitText(
      ctx,
      name.slice(0, 40),
      800,
      Math.round(u * 0.05),
      W - nameX - pad,
      Math.round(u * 0.03),
    );
    ctx.fillStyle = fg;
    ctx.font = `800 ${fitted.size}px ${CARD_FONT}`;
    ctx.fillText(fitted.text, nameX, headerY + logo / 2 + fitted.size * 0.35);

    // call-to-action pill at the bottom
    const ctaSize = Math.round(u * 0.034),
      ctaH = Math.round(u * 0.085);
    ctx.font = `700 ${ctaSize}px ${CARD_FONT}`;
    const ctaW = Math.round(ctx.measureText(cta).width + ctaH * 0.9);
    const ctaY = H - pad - ctaH;
    ctx.fillStyle = fg;
    roundRectPath(ctx, pad, ctaY, ctaW, ctaH, ctaH / 2);
    ctx.fill();
    ctx.fillStyle = light ? "#ffffff" : shade(color, 0.6);
    ctx.textAlign = "center";
    ctx.fillText(cta, pad + ctaW / 2, ctaY + ctaH / 2 + ctaSize * 0.35);
    ctx.textAlign = "left";

    // headline: shrink until it fits in 4 lines
    const maxW = wide ? Math.round(W * 0.78) : W - pad * 2;
    let fs = Math.round(u * (wide ? 0.11 : 0.095)),
      lines = [];
    do {
      ctx.font = `800 ${fs}px ${CARD_FONT}`;
      lines = wrapCanvasLines(ctx, headline, maxW);
      if (lines.length <= 4) break;
      fs -= 4;
    } while (fs > 36);
    if (lines.length > 4) {
      lines = lines.slice(0, 4);
      lines[3] = lines[3].replace(/\s*\S*$/, "") + "…";
    }
    const lh = Math.round(fs * 1.14);
    const chipSize = Math.round(u * 0.028),
      chipH = Math.round(u * 0.058);
    ctx.font = `700 ${chipSize}px ${CARD_FONT}`;
    const chipW = Math.round(ctx.measureText(badge).width + chipH * 0.9);
    const goalSize = Math.round(u * 0.036);
    const blockH =
      chipH +
      Math.round(u * 0.04) +
      lines.length * lh +
      (goal ? Math.round(u * 0.03) + goalSize : 0);
    const top = headerY + logo,
      bottom = ctaY;
    let y = Math.round(top + (bottom - top - blockH) / 2);

    // platform chip above the headline
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = fg;
    roundRectPath(ctx, pad, y, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `700 ${chipSize}px ${CARD_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(badge, pad + chipW / 2, y + chipH / 2 + chipSize * 0.35);
    ctx.textAlign = "left";
    y += chipH + Math.round(u * 0.04);

    ctx.fillStyle = fg;
    ctx.font = `800 ${fs}px ${CARD_FONT}`;
    lines.forEach((ln) => {
      ctx.fillText(ln, pad, y + fs * 0.85);
      y += lh;
    });

    if (goal) {
      y += Math.round(u * 0.03);
      ctx.globalAlpha = 0.85;
      ctx.font = `600 ${goalSize}px ${CARD_FONT}`;
      ctx.fillText(`Goal: ${goal}`, pad, y + goalSize * 0.85);
      ctx.globalAlpha = 1;
    }

    // show the card at a size that fits the screen (tall 9:16 cards no longer need scrolling)
    const shownW = Math.min(
      380,
      Math.round((window.innerHeight * 0.72 * W) / H),
    );
    canvas.style.width = Math.max(180, shownW) + "px";
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    canvas.hidden = false;
    $("cardDownload").disabled = false;
    status.textContent = `Preview built (${W} × ${H}). Check the final text and rights before posting, then download the PNG.`;
    return true;
  }
  const showCard = () => {
    const c = $("brandCard");
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (c.scrollIntoView)
      c.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "nearest",
      });
  };
  $("cardBuild").addEventListener("click", () => {
    const product = escText($("productName").value),
      caption = escText($("captionEdit").value);
    if (!product && !caption) {
      $("cardStatus").textContent =
        "Enter a product or write a caption first; the headline comes from them.";
      return;
    }
    if (drawBrandCard()) showCard();
  });
  // keep the card in sync when a brief is created, without moving the page
  $("buildReel").addEventListener("click", () => {
    if (escText($("productName").value)) drawBrandCard();
  });
  $("cardDownload").addEventListener("click", () => {
    const canvas = $("brandCard");
    if (canvas.hidden) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        $("cardStatus").textContent =
          "Could not create the image in this browser.";
        return;
      }
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "editprompt-brand-card.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, "image/png");
  });

  /* ===== Photo: compare handle, labels and drag-to-slide ===== */
  const baGrid = $("compareGrid");
  const baHandle = document.createElement("div");
  baHandle.className = "ba-handle";
  baHandle.setAttribute("aria-hidden", "true");
  const baTagL = document.createElement("span");
  baTagL.className = "ba-tag ba-tag-l";
  baTagL.textContent = "Edited";
  const baTagR = document.createElement("span");
  baTagR.className = "ba-tag ba-tag-r";
  baTagR.textContent = "Original";
  baGrid.append(baHandle, baTagL, baTagR);
  const moveSplitTo = (clientX) => {
    const r = baGrid.getBoundingClientRect();
    const pct = Math.min(
      100,
      Math.max(0, ((clientX - r.left) / r.width) * 100),
    );
    $("baSplit").value = String(Math.round(pct));
    setSplit();
  };
  baGrid.addEventListener("pointerdown", (e) => {
    if (!baOn) return;
    baGrid.setPointerCapture(e.pointerId);
    baGrid.dataset.dragging = "1";
    moveSplitTo(e.clientX);
  });
  baGrid.addEventListener("pointermove", (e) => {
    if (baOn && baGrid.dataset.dragging === "1") moveSplitTo(e.clientX);
  });
  const endDrag = () => delete baGrid.dataset.dragging;
  baGrid.addEventListener("pointerup", endDrag);
  baGrid.addEventListener("pointercancel", endDrag);

  $("recentSearch").addEventListener("input", renderRecent);
  $("recentFilter").addEventListener("change", renderRecent);

  /* ===== Keyboard shortcuts panel (press ?) ===== */
  const scPanel = document.createElement("div");
  scPanel.id = "shortcutsPanel";
  scPanel.hidden = true;
  scPanel.setAttribute("role", "dialog");
  scPanel.setAttribute("aria-label", "Keyboard shortcuts");
  scPanel.innerHTML =
    '<div class="sc-card"><div class="status pe-title">Keyboard shortcuts</div>' +
    '<dl class="sc-list">' +
    "<dt>Ctrl / Cmd + Z</dt><dd>Undo photo edit</dd>" +
    "<dt>Ctrl / Cmd + Y</dt><dd>Redo photo edit</dd>" +
    "<dt>Ctrl / Cmd + Enter</dt><dd>Build storyboard or reel brief from the active input</dd>" +
    "<dt>?</dt><dd>Show or hide this list</dd>" +
    "<dt>Esc</dt><dd>Close</dd></dl>" +
    '<button type="button" class="btn ghost" id="scClose">Close</button></div>';
  document.body.appendChild(scPanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !scPanel.hidden) {
      scPanel.hidden = true;
      return;
    }
    const t = e.target,
      typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.isContentEditable;
    if (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      scPanel.hidden = !scPanel.hidden;
    }
  });
  scPanel.addEventListener("click", (e) => {
    if (e.target === scPanel || e.target.id === "scClose")
      scPanel.hidden = true;
  });

  /* ===== Brand kit (saved in this browser) ===== */
  const BRAND_KEY = "editprompt.creatorStudio.brand";
  const readBrand = () => {
    try {
      return JSON.parse(localStorage.getItem(BRAND_KEY)) || {};
    } catch {
      return {};
    }
  };
  (function loadBrandForm() {
    const b = readBrand();
    $("brandKitName").value = b.name || "";
    $("brandKitColor").value = b.color || "#e5233a";
  })();
  $("brandKitSave").addEventListener("click", () => {
    const b = {
      name: escText($("brandKitName").value).slice(0, 40),
      color: $("brandKitColor").value,
    };
    try {
      localStorage.setItem(BRAND_KEY, JSON.stringify(b));
    } catch {
      /* storage unavailable: nothing saved */
    }
    $("brandKitStatus").textContent = b.name
      ? `Brand kit saved for "${b.name}".`
      : "Brand kit saved (no name yet).";
  });
  $("brandKitApply").addEventListener("click", () => {
    const b = readBrand();
    if (!b.name) {
      $("brandKitStatus").textContent = "Save a brand name first.";
      return;
    }
    $("brandName").value = b.name;
    if (!$("wmText").value) $("wmText").value = b.name;
    $("wmColor").value = b.color || "#ffffff";
    drawPhoto();
    peCommit();
    $("brandKitStatus").textContent =
      `Applied "${b.name}" to the reel brand field, watermark and colour.`;
  });

  /* ===== Caption ideas written from the brief (two options, no external AI) ===== */
  const GOAL_CTA = {
    awareness: "Save this for later and share it with someone who needs it.",
    sales: "Tap the link to get yours today.",
    engagement: "Tell us in the comments: what would you try first?",
    announcement: "Follow along so you do not miss the next update.",
  };
  $("writeCaption").addEventListener("click", () => {
    const box = $("captionOutput");
    const product = escText($("productName").value);
    if (!product) {
      box.hidden = false;
      box.textContent = "Enter a product or topic first.";
      return;
    }
    const brand = escText($("brandName").value),
      audience = escText($("audience").value);
    const cta = GOAL_CTA[$("reelGoal").value] || GOAL_CTA.awareness;
    const who = audience ? `For ${audience}: ` : "";
    const by = brand ? ` from ${brand}` : "";
    const options = [
      `${who}${product}${by}. ${cta}`,
      `Here is what makes ${product}${by} worth a look. ${cta}`,
    ];
    box.textContent = "";
    box.hidden = false;
    options.forEach((text) => {
      const row = document.createElement("div");
      row.className = "recent-row";
      const span = document.createElement("span");
      span.textContent = text;
      row.append(
        span,
        mkBtn("Use", () => {
          $("captionEdit").value = text;
          updateCaptionCount();
          runCaptionChecks();
        }),
        mkBtn("Copy", () => copy(text)),
      );
      box.appendChild(row);
    });
  });

  /* ===== Caption checks (common issues only; no bad-word list) ===== */
  function runCaptionChecks() {
    const t = $("captionEdit").value,
      issues = [];
    const emoji = (t.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (emoji > 5)
      issues.push("Many emoji: a few well-placed ones usually read better.");
    if (
      t
        .split(/[.!?]+/)
        .some((s) => s.trim().split(/\s+/).filter(Boolean).length > 25)
    )
      issues.push(
        "A sentence is over 25 words: split it up for easier reading.",
      );
    if ((t.match(/\b[A-Z]{3,}\b/g) || []).length > 2)
      issues.push("Several ALL CAPS words: use them sparingly.");
    const tags = (t.match(/#\w+/g) || []).length;
    if (tags > 10)
      issues.push(`${tags} hashtags: keep only the most relevant ones.`);
    const firstLine = t.split("\n")[0].trim();
    if (firstLine.split(/\s+/).length > 8)
      issues.push(
        "The first line has more than 8 words: a shorter hook usually holds attention better.",
      );
    if (/https?:\/\/|www\./i.test(t))
      issues.push(
        "Links are not clickable on every platform; check how yours displays them.",
      );
    $("captionChecks").textContent = !t.trim()
      ? ""
      : issues.length
        ? "Check: " + issues.join(" ")
        : "Looks good: no common issues found.";
  }
  $("captionEdit").addEventListener("input", runCaptionChecks);

  /* ===== Storyboard PDF (plain text, built-in Helvetica, no external library) ===== */
  function pdfSafe(s) {
    return s
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, "...")
      .replace(/[^\x00-\xFF]/g, "?");
  }
  function wrapText(text, max) {
    const out = [];
    let cur = "";
    text.split(/\s+/).forEach((w) => {
      if ((cur + " " + w).trim().length > max) {
        if (cur) out.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    });
    out.push(cur);
    return out;
  }
  function buildStoryboardPdf(title, body) {
    const W = 595,
      H = 842,
      M = 56,
      LH = 14,
      MAX = 84;
    const rows = [];
    body.split("\n").forEach((raw) => {
      const line = pdfSafe(raw.trimEnd());
      if (!line.trim()) {
        rows.push({ text: "", bold: false });
        return;
      }
      const bold =
        line.trim().length < 70 &&
        (/^SCENE\b/.test(line.trim()) ||
          /^[A-Z][A-Z0-9 \/&()\-:,'·]+$/.test(line.trim()));
      wrapText(line, MAX).forEach((t) => rows.push({ text: t, bold }));
    });
    const perPage = Math.floor((H - 2 * M - 24) / LH);
    const pages = [];
    for (let i = 0; i < rows.length; i += perPage)
      pages.push(rows.slice(i, i + perPage));
    if (!pages.length) pages.push([]);
    const esc = (s) =>
      s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const streams = pages.map((rs, pi) => {
      let c = `BT /F1 8 Tf ${M} ${H - M + 12} Td (${esc(pdfSafe(title))}) Tj ET\n`;
      let y = H - M - 24;
      rs.forEach((r) => {
        if (r.text)
          c += `BT /${r.bold ? "F2 11" : "F1 10"} Tf ${M} ${y} Td (${esc(r.text)}) Tj ET\n`;
        y -= LH;
      });
      c += `BT /F1 8 Tf ${M} ${M - 22} Td (Page ${pi + 1} of ${pages.length}) Tj ET\n`;
      return c;
    });
    const objs = [];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ")}] /Count ${pages.length} >>`;
    objs[3] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objs[4] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    streams.forEach((c, i) => {
      const cid = 6 + 2 * i;
      objs[5 + 2 * i] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`;
      objs[cid] = `<< /Length ${c.length} >>\nstream\n${c}endstream`;
    });
    const maxId = objs.length - 1;
    let out = "%PDF-1.4\n";
    const offs = [];
    for (let id = 1; id <= maxId; id++) {
      offs[id] = out.length;
      out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id++)
      out += `${String(offs[id]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 255)], {
      type: "application/pdf",
    });
  }
  $("pdfScene").addEventListener("click", () => {
    if (!sceneState) {
      $("sceneOutput").textContent = "Build a storyboard first.";
      return;
    }
    const brand = readBrand().name || "EditPrompt";
    const blob = buildStoryboardPdf(`${brand} · Storyboard`, sceneText);
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "editprompt-storyboard.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  });

  /* ===== Project Library: approval status per item ===== */
  const STATUSES = ["Draft", "In review", "Approved"];
  function renderRecent() {
    const box = $("recentList"),
      all = readJSON(RECENT_KEY);
    const q = ($("recentSearch").value || "").trim().toLowerCase(),
      kind = $("recentFilter").value;
    box.textContent = "";
    if (!all.length) {
      box.textContent =
        "Nothing saved yet. Storyboards, reel briefs and photo exports appear here.";
      return;
    }
    box.appendChild(
      mkBtn("Clear all", () => {
        writeJSON(RECENT_KEY, []);
        renderRecent();
      }),
    );
    const shown = all
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item }) =>
          (kind === "all" || item.kind === kind) &&
          (!q || `${item.title} ${item.text}`.toLowerCase().includes(q)),
      );
    if (!shown.length) {
      const m = document.createElement("div");
      m.className = "status";
      m.textContent = "No saved items match this search.";
      box.appendChild(m);
      return;
    }
    shown.forEach(({ item, i }) => {
      const row = document.createElement("div");
      row.className = "recent-row";
      const meta = document.createElement("div");
      const title = document.createElement("span");
      title.textContent = `${item.kind} · ${item.title}`;
      const badge = document.createElement("span");
      badge.className = "status";
      badge.textContent = ` [${item.status || "Draft"}]`;
      const when = document.createElement("small");
      when.textContent = new Date(item.at).toLocaleString();
      meta.append(title, badge, document.createElement("br"), when);
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.style.marginTop = "0";
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", "Approval status");
      STATUSES.forEach((s) => sel.add(new Option(s, s)));
      sel.value = item.status || "Draft";
      sel.addEventListener("change", () => {
        const l = readJSON(RECENT_KEY);
        if (l[i]) {
          l[i].status = sel.value;
          writeJSON(RECENT_KEY, l);
        }
        renderRecent();
      });
      actions.append(
        sel,
        mkBtn("Copy", () => copy(item.text)),
        mkBtn("Duplicate", () => {
          const l = readJSON(RECENT_KEY);
          l.unshift({
            ...item,
            title: (item.title + " (copy)").slice(0, 60),
            at: new Date().toISOString(),
          });
          writeJSON(RECENT_KEY, l.slice(0, 10));
          renderRecent();
        }),
        mkBtn("Download", () =>
          download(
            `editprompt-${item.kind.toLowerCase().replace(/\s+/g, "-")}.txt`,
            item.text,
          ),
        ),
        mkBtn("Remove", () => {
          const l = readJSON(RECENT_KEY);
          l.splice(i, 1);
          writeJSON(RECENT_KEY, l);
          renderRecent();
        }),
      );
      row.append(meta, actions);
      box.appendChild(row);
    });
  }

  /* ===== Accessibility: announce results to screen readers ===== */
  [
    "sceneOutput",
    "reelOutput",
    "hashtagOutput",
    "thumbOutput",
    "recentList",
    "brandKitStatus",
    "captionChecks",
    "platformTip",
  ].forEach((id) => {
    const el = $(id);
    if (el && !el.hasAttribute("aria-live"))
      el.setAttribute("aria-live", "polite");
  });
  runCaptionChecks();

  /* ===== Additional creator tools (built here and appended to their panels) ===== */
  const mk = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "text") n.textContent = v;
      else if (k === "on")
        Object.entries(v).forEach(([ev, fn]) => n.addEventListener(ev, fn));
      else n.setAttribute(k, v);
    });
    kids.forEach((c) =>
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c),
    );
    return n;
  };
  const sbtn = (label, fn) =>
    mk("button", {
      type: "button",
      class: "btn ghost",
      text: label,
      on: { click: fn },
    });
  const sgroup = (title, ...kids) =>
    mk("div", { class: "pe-group" }, [
      mk("div", { class: "status pe-title", text: title }),
      ...kids,
    ]);
  const sactions = (...kids) => mk("div", { class: "actions" }, kids);
  const sstatus = (id) =>
    mk("div", { id, class: "status", "aria-live": "polite" });
  const panelOf = (id) => $(id).closest(".tool-panel");
  const relLuminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const contrastRatio = (a, b) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  /* ----- Reel: 3-second hook timer ----- */
  const hookStatus = sstatus("hookStatus");
  const hookBar = mk("div", { class: "hook-bar" });
  let hookTimer = null;
  function playHook() {
    const line =
      escText($("captionEdit").value).split("\n")[0] ||
      escText($("productName").value);
    if (!line) {
      hookStatus.textContent =
        "Write a caption or enter a product first; the first line is the hook.";
      return;
    }
    const words = line.split(/\s+/).length;
    clearInterval(hookTimer);
    hookStatus.textContent = `Hook: "${line}" (${words} words${words > 8 ? ", aim for 8 or fewer" : ""})`;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      hookBar.style.width = "100%";
      return;
    }
    hookBar.style.width = "0%";
    const started = Date.now();
    hookTimer = setInterval(() => {
      const t = (Date.now() - started) / 3000;
      hookBar.style.width = Math.min(100, t * 100) + "%";
      if (t >= 1) {
        clearInterval(hookTimer);
        hookStatus.textContent += " · 3 seconds: hook time is up";
      }
    }, 100);
  }

  /* ----- Reel: thumbnail mock-up with contrast check ----- */
  const thumbPreview = mk("div", {
    style:
      "display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;margin-top:10px;",
  });
  const thumbStatus = sstatus("thumbMockStatus");
  function drawThumb(canvas, W, H, text, name, color, tall) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const light = luminance(color) > 0.6;
    const fg = light ? "#111111" : "#ffffff";
    const u = Math.min(W, H);
    const pad = Math.round(u * (tall ? 0.09 : 0.07));
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // decorative shapes
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(
      W * (tall ? 0.9 : 0.88),
      H * (tall ? 0.18 : 0.5),
      u * (tall ? 0.3 : 0.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W * 0.04, H * 0.98, u * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // brand chip (logo mark + name). On tall covers it sits clear of the app UI at the top.
    const logo = Math.round(u * (tall ? 0.075 : 0.085));
    const bx = pad,
      by = tall ? Math.round(H * 0.1) : pad;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(bx + logo / 2, by + logo / 2, logo / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light ? "#ffffff" : shade(color, 0.6);
    ctx.font = `800 ${Math.round(logo * 0.55)}px ${CARD_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      (name.trim()[0] || "B").toUpperCase(),
      bx + logo / 2,
      by + logo * 0.69,
    );
    ctx.textAlign = "left";
    const nameX = bx + logo + Math.round(u * 0.022);
    const f = fitText(
      ctx,
      name.slice(0, 40),
      800,
      Math.round(u * (tall ? 0.04 : 0.05)),
      W - nameX - pad,
      Math.round(u * 0.026),
    );
    ctx.fillStyle = fg;
    ctx.font = `800 ${f.size}px ${CARD_FONT}`;
    ctx.fillText(f.text, nameX, by + logo / 2 + f.size * 0.35);

    // big headline text, shrunk until it fits the free area (max 3 lines wide, 5 lines tall)
    const maxLines = tall ? 5 : 3;
    const maxW = tall ? W - pad * 2 : Math.round(W * 0.66);
    const barH = Math.round(u * 0.016),
      gap = Math.round(u * 0.04);
    const regionTop = by + logo + Math.round(u * (tall ? 0.05 : 0.08));
    const regionBottom = tall
      ? Math.round(H * 0.8)
      : H - pad - Math.round(u * 0.03);
    let fs = Math.round(u * (tall ? 0.15 : 0.19)),
      lines = [];
    do {
      ctx.font = `900 ${fs}px ${CARD_FONT}`;
      lines = wrapCanvasLines(ctx, text, maxW);
      if (
        lines.length <= maxLines &&
        lines.length * Math.round(fs * 1.1) + gap + barH <=
          regionBottom - regionTop
      )
        break;
      fs -= 4;
    } while (fs > 40);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    }
    const lh = Math.round(fs * 1.1);
    const blockH = lines.length * lh + gap + barH;
    let y = Math.round(regionTop + (regionBottom - regionTop - blockH) / 2);
    ctx.save();
    ctx.shadowColor = light ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.35)";
    ctx.shadowBlur = Math.round(u * 0.02);
    ctx.shadowOffsetY = Math.round(u * 0.006);
    ctx.fillStyle = fg;
    ctx.font = `900 ${fs}px ${CARD_FONT}`;
    lines.forEach((ln) => {
      ctx.fillText(ln, pad, y + fs * 0.85);
      y += lh;
    });
    ctx.restore();
    // accent bar under the text
    ctx.fillStyle = fg;
    roundRectPath(ctx, pad, y + gap * 0.5, Math.round(u * 0.2), barH, barH / 2);
    ctx.fill();
    return true;
  }
  function thumbBlock(label, W, H, tall, text, name, color, file) {
    const cv = mk("canvas", { "aria-label": label });
    drawThumb(cv, W, H, text, name, color, tall);
    cv.style.cssText = `width:${tall ? "170px" : "min(100%, 420px)"};height:auto;border-radius:12px;box-shadow:0 6px 22px rgba(0,0,0,.35);`;
    const dl = sbtn(`Download PNG (${W} × ${H})`, () =>
      cv.toBlob((blob) => {
        if (!blob)
          return (thumbStatus.textContent =
            "Could not create the image in this browser.");
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = file;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }, "image/png"),
    );
    return mk("div", { style: "display:grid;gap:6px;" }, [
      cv,
      mk("div", { class: "status", text: label }),
      dl,
    ]);
  }
  function buildThumbMock() {
    const brand = readBrand();
    const color = brand.color || "#e5233a";
    const name = escText($("brandName").value) || brand.name || "Your brand";
    const text = (
      escText($("thumbText").value) ||
      escText($("productName").value) ||
      "Your title"
    ).slice(0, 40);
    const cWhite = contrastRatio(relLuminance(color), relLuminance("#ffffff"));
    const cBlack = contrastRatio(relLuminance(color), relLuminance("#111111"));
    const ratio = Math.max(cWhite, cBlack);
    thumbPreview.textContent = "";
    thumbPreview.append(
      thumbBlock(
        "16:9 YouTube thumbnail",
        1280,
        720,
        false,
        text,
        name,
        color,
        "editprompt-thumbnail-16x9.png",
      ),
      thumbBlock(
        "9:16 reel cover",
        1080,
        1920,
        true,
        text,
        name,
        color,
        "editprompt-reel-cover-9x16.png",
      ),
    );
    thumbStatus.textContent = `Text contrast ${ratio.toFixed(1)}:1 on this background. WCAG suggests at least 4.5:1 for normal text: ${ratio >= 4.5 ? "good" : "low, so try a different brand colour"}. Keep the text to 3–5 words so it stays readable on a phone.`;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (thumbPreview.scrollIntoView)
      thumbPreview.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "nearest",
      });
  }

  /* ----- Reel: platform sizes (general guide) ----- */
  const SPECS = [
    "Instagram feed: square 1080 × 1080, portrait 1080 × 1350 (4:5), landscape about 1080 × 566.",
    "Instagram Reels: vertical 1080 × 1920 (9:16).",
    "YouTube videos: landscape 1920 × 1080 (16:9). YouTube thumbnails: 1280 × 720 (16:9).",
    "YouTube Shorts: vertical 1080 × 1920 (9:16). Check the current length limit on YouTube's help pages.",
    "Facebook feed: link image 1200 × 630; video in 1:1, 4:5 or 9:16 works well in feed.",
    "TikTok: vertical 1080 × 1920 (9:16).",
  ];
  const specOut = mk("div", { id: "specOutput", class: "out", hidden: "" });
  function showSpecs() {
    specOut.textContent =
      "Platform sizes (general guide)\n\n" +
      SPECS.join("\n") +
      "\n\nSpecs and length limits change. Check the official creator or help page before you publish.";
    specOut.hidden = false;
  }

  /* ----- Photo: before / after PNG ----- */
  function exportBeforeAfter() {
    if (!needImage()) return;
    const o = $("originalCanvas"),
      p = $("photoCanvas");
    const gap = 24,
      top = 56;
    const W = o.width + p.width + gap * 3,
      H = Math.max(o.height, p.height) + top + gap;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    if (!x) {
      $("photoStatus").textContent =
        "This browser cannot draw the comparison image.";
      return;
    }
    x.fillStyle = "#fff";
    x.fillRect(0, 0, W, H);
    x.fillStyle = "#111";
    x.font = "700 22px system-ui, Arial, sans-serif";
    x.textBaseline = "middle";
    x.fillText("Original", gap, top / 2);
    x.fillText("Edited", gap * 2 + o.width, top / 2);
    x.drawImage(o, gap, top);
    x.drawImage(p, gap * 2 + o.width, top);
    c.toBlob((blob) => {
      if (!blob) {
        $("photoStatus").textContent =
          "Could not create the image in this browser.";
        return;
      }
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "editprompt-before-after.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, "image/png");
  }

  /* ----- Build the panels ----- */
  const reelPanel = panelOf("captionEdit");
  const reelCol = reelPanel.querySelector(".reel-tools") || reelPanel;
  reelCol.appendChild(
    sgroup(
      "Hook timer (3 seconds)",
      hookStatus,
      mk("div", { class: "hook-track" }, [hookBar]),
      sactions(sbtn("Play hook timer", playHook)),
    ),
  );
  const thumbGroup = sgroup(
    "Thumbnail mock-up",
    mk("input", {
      id: "thumbText",
      maxlength: "40",
      placeholder: "Thumbnail text (3–5 words)",
      "aria-label": "Thumbnail text",
    }),
    sactions(sbtn("Show thumbnail mock-up", buildThumbMock)),
    thumbPreview,
    thumbStatus,
  );
  const reelTools = reelPanel.querySelector(".reel-tools") || reelPanel;
  reelTools.insertBefore(thumbGroup, reelTools.children[2] || null);
  reelCol.appendChild(
    sgroup(
      "Platform sizes",
      sactions(sbtn("Show platform sizes", showSpecs)),
      specOut,
    ),
  );
  panelOf("photoCanvas").appendChild(
    sgroup(
      "Comparison export",
      sactions(sbtn("Export before / after PNG", exportBeforeAfter)),
    ),
  );

  /* initial state for new features */
  updatePlatformTip();
  renderRecent();

  /* initial state */
  renderLooks();
  renderRecent();
  updateCaptionCount();
  setSplit();

  $("clearPhoto").addEventListener("click", clearPhoto);
  $("newScene").addEventListener("click", clearScene);
  $("clearReel").addEventListener("click", clearReel);
})();
