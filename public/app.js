const $ = (id) => document.getElementById(id);

/* =========================================================
   HELPERS
========================================================= */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[c],
  );
}

function toast(message) {
  const t = $("toast");

  if (!t) return;

  t.textContent = message;
  t.classList.add("show");

  clearTimeout(t._timer);

  t._timer = setTimeout(() => {
    t.classList.remove("show");
  }, 1800);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function apiFetch(url, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
}

async function apiRequest(url, options = {}) {
  const response = await apiFetch(url, options);
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `Request failed (${response.status})`,
    );
  }

  return data;
}

async function copyText(text) {
  if (!text) return false;

  try {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(
      0,
      textarea.value.length,
    );

    const copied =
      document.execCommand("copy");

    textarea.remove();

    return copied;
  } catch {
    return false;
  }
}

// Text of the Generated Prompt box (keeps line breaks, ignores the placeholder).
function outputText() {
  const box = $("output");

  if (!box) return "";

  return String(box.innerText ?? box.textContent ?? "")
    .replace(/\r/g, "")
    .trim();
}

function isPlaceholderPrompt(text) {
  return (
    !text ||
    text.startsWith("Your prompt will appear")
  );
}

function setButtonState(
  button,
  disabled,
  text,
) {
  if (!button) return;

  button.disabled = disabled;

  if (typeof text === "string") {
    button.textContent = text;
  }
}

/* =========================================================
   MULTI SELECT
========================================================= */

function createMultiSelect({
  fieldId,
  controlId,
  chipsId,
  dropdownId,
  placeholder = "Select…",
}) {
  const field = $(fieldId);
  const control = $(controlId);
  const chips = $(chipsId);
  const dropdown = $(dropdownId);

  if (!field || !control || !chips || !dropdown) {
    console.warn(`MultiSelect missing: ${fieldId}`);
    return { values: [], selectOnly() {}, selectValues() {}, clear() {} };
  }

  const checkboxes = [...dropdown.querySelectorAll('input[type="checkbox"]')];
  const optionLabels = checkboxes.map((checkbox) => checkbox.closest('label')).filter(Boolean);
  let selected = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);

  // Inline autocomplete input: the user can type directly inside the field
  // (e.g. Camera -> "c") and see filtered suggestions immediately below.
  let searchInput = control.querySelector('.ms-inline-search');
  if (!searchInput) {
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'ms-inline-search';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('aria-label', `Search ${placeholder}`);
    searchInput.placeholder = placeholder;
    control.appendChild(searchInput);
  }

  function filterOptions(term = '') {
    const q = String(term).trim().toLowerCase();
    let visible = 0;
    optionLabels.forEach((label) => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      const text = (checkbox?.value || label.textContent || '').toLowerCase();
      const match = !q || text.includes(q);
      label.style.display = match ? 'flex' : 'none';
      if (match) visible += 1;
    });
    const empty = dropdown.querySelector('.ms-no-results');
    if (empty) empty.remove();
    if (!visible) {
      const noResults = document.createElement('div');
      noResults.className = 'ms-no-results';
      noResults.textContent = `No matching ${placeholder.replace(/[.…]+$/, '').toLowerCase()} found`;
      dropdown.appendChild(noResults);
    }
  }

  function setOpen(open) {
    dropdown.classList.toggle('hide', !open);
    control.classList.toggle('open', open);
    control.setAttribute('aria-expanded', String(open));
    if (open) {
      filterOptions(searchInput.value);
    }
  }

  function render() {
    // The inline search input already displays the placeholder.
    // Do not render the same placeholder again inside the chips row.
    if (!selected.length) {
      chips.innerHTML = '';
    } else {
      chips.innerHTML = selected.map((value) => `
        <span class="chip">
          ${esc(value)}
          <button type="button" data-v="${esc(value)}" aria-label="Remove ${esc(value)}">×</button>
        </span>
      `).join('');
    }

    chips.querySelectorAll('button').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const value = button.dataset.v || '';
        selected = selected.filter((item) => item !== value);
        const checkbox = checkboxes.find((item) => item.value === value);
        if (checkbox) checkbox.checked = false;
        render();
        filterOptions(searchInput.value);
      };
    });
  }

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!selected.includes(checkbox.value)) selected.push(checkbox.value);
      } else {
        selected = selected.filter((value) => value !== checkbox.value);
      }
      render();
      // Keep the suggestion list open while selecting multiple options.
      setOpen(true);
    });
  });

  searchInput.addEventListener('focus', () => {
    setOpen(true);
    filterOptions(searchInput.value);
  });
  searchInput.addEventListener('input', () => {
    setOpen(true);
    filterOptions(searchInput.value);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const visible = optionLabels.filter((label) => label.style.display !== 'none');
      if (visible.length === 1) {
        event.preventDefault();
        const checkbox = visible[0].querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      searchInput.value = '';
      filterOptions('');
      setOpen(false);
    }
  });

  control.onclick = (event) => {
    if (event.target.closest('.chip button')) return;
    if (event.target === searchInput || event.target.closest('.ms-inline-search')) return;
    event.preventDefault();
    event.stopPropagation();
    const isOpen = !dropdown.classList.contains('hide');
    setOpen(!isOpen);
  };

  control.onkeydown = (event) => {
    if (event.target === searchInput) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      control.click();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  document.addEventListener('click', (event) => {
    if (!field.contains(event.target)) {
      setOpen(false);
    }
  });

  render();

  return {
    get values() { return [...selected]; },
    selectOnly(value) {
      checkboxes.forEach((checkbox) => { checkbox.checked = checkbox.value === value; });
      selected = checkboxes.some((checkbox) => checkbox.value === value) ? [value] : [];
      render();
    },
    selectValues(values = []) {
      const wanted = Array.isArray(values) ? values : [values];
      checkboxes.forEach((checkbox) => { checkbox.checked = wanted.includes(checkbox.value); });
      selected = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      render();
    },
    clear() {
      checkboxes.forEach((checkbox) => { checkbox.checked = false; });
      selected = [];
      searchInput.value = '';
      filterOptions('');
      render();
    },
  };
}

/* =========================================================
   MULTI SELECT INITIALIZATION
========================================================= */

const styleSelect = createMultiSelect({
  fieldId: "styleField",
  controlId: "styleControl",
  chipsId: "styleChips",
  dropdownId: "styleDropdown",
  placeholder: "Select style(s)…",
});

const cameraSelect = createMultiSelect({
  fieldId: "cameraField",
  controlId: "cameraControl",
  chipsId: "cameraChips",
  dropdownId: "cameraDropdown",
  placeholder: "Select camera move(s)…",
});

const lightingSelect = createMultiSelect({
  fieldId: "lightingField",
  controlId: "lightingControl",
  chipsId: "lightingChips",
  dropdownId: "lightingDropdown",
  placeholder: "Select lighting…",
});

const moodSelect = createMultiSelect({
  fieldId: "moodField",
  controlId: "moodControl",
  chipsId: "moodChips",
  dropdownId: "moodDropdown",
  placeholder: "Select mood(s)…",
});

/* ---------- ADVANCED CINEMATOGRAPHY FIELDS ---------- */

const ADV_SELECTS = {
  shotType: createMultiSelect({
    fieldId: "shotField",
    controlId: "shotControl",
    chipsId: "shotChips",
    dropdownId: "shotDropdown",
    placeholder: "Select shot type(s)…",
  }),
  cameraAngle: createMultiSelect({
    fieldId: "angleField",
    controlId: "angleControl",
    chipsId: "angleChips",
    dropdownId: "angleDropdown",
    placeholder: "Select camera angle(s)…",
  }),
  composition: createMultiSelect({
    fieldId: "compositionField",
    controlId: "compositionControl",
    chipsId: "compositionChips",
    dropdownId: "compositionDropdown",
    placeholder: "Select composition…",
  }),
  focus: createMultiSelect({
    fieldId: "focusField",
    controlId: "focusControl",
    chipsId: "focusChips",
    dropdownId: "focusDropdown",
    placeholder: "Select focus style…",
  }),
  motionSpeed: createMultiSelect({
    fieldId: "speedField",
    controlId: "speedControl",
    chipsId: "speedChips",
    dropdownId: "speedDropdown",
    placeholder: "Select motion speed…",
  }),
  colorGrade: createMultiSelect({
    fieldId: "gradeField",
    controlId: "gradeControl",
    chipsId: "gradeChips",
    dropdownId: "gradeDropdown",
    placeholder: "Select color grade(s)…",
  }),
  filmLook: createMultiSelect({
    fieldId: "filmField",
    controlId: "filmControl",
    chipsId: "filmChips",
    dropdownId: "filmDropdown",
    placeholder: "Select film look…",
  }),
  timeOfDay: createMultiSelect({
    fieldId: "todField",
    controlId: "todControl",
    chipsId: "todChips",
    dropdownId: "todDropdown",
    placeholder: "Select time of day…",
  }),
  weather: createMultiSelect({
    fieldId: "weatherField",
    controlId: "weatherControl",
    chipsId: "weatherChips",
    dropdownId: "weatherDropdown",
    placeholder: "Select weather…",
  }),
  sound: createMultiSelect({
    fieldId: "soundField",
    controlId: "soundControl",
    chipsId: "soundChips",
    dropdownId: "soundDropdown",
    placeholder: "Select sound…",
  }),
};

// Everything from the advanced section, ready to send to the server.
function advancedPayload() {
  const out = {};

  for (const [key, select] of Object.entries(ADV_SELECTS)) {
    out[key] = select.values;
  }

  out.character = $("character")?.value.trim() || "";
  out.extras = $("extras")?.value.trim() || "";

  return out;
}

function updateAdvancedCount() {
  const total =
    Object.values(ADV_SELECTS).reduce(
      (sum, select) => sum + select.values.length,
      0,
    ) +
    ($("character")?.value.trim() ? 1 : 0) +
    ($("extras")?.value.trim() ? 1 : 0);

  if ($("advCount")) {
    $("advCount").textContent = total ? `${total} selected` : "Optional";
  }
}

(function setupAdvancedFields() {
  const box = $("advFields");

  if (!box) return;

  // capture phase: chip "x" buttons stop bubbling, so listen on the way down
  ["click", "change", "input"].forEach((type) =>
    box.addEventListener(type, () => setTimeout(updateAdvancedCount, 0), true),
  );

  $("advClearBtn")?.addEventListener("click", () => {
    Object.values(ADV_SELECTS).forEach((select) => select.clear());

    if ($("character")) $("character").value = "";
    if ($("extras")) $("extras").value = "";

    updateAdvancedCount();
  });
})();



/* =========================================================
   SMART TEXT SUGGESTIONS FOR LONG-FORM FIELDS
========================================================= */
(function setupSmartTextSuggestions(){
  const groups = {
    character: [
      "Young professional wearing a tailored suit", "Casual modern streetwear", "Elegant formal attire",
      "Traditional Indian clothing", "Natural hairstyle and realistic skin texture", "Confident relaxed expression"
    ],
    extras: [
      "Subtle background pedestrians", "Natural traffic movement", "Soft atmospheric haze", "Realistic reflections",
      "Distant city lights", "Gentle wind moving nearby objects", "Cinematic background details"
    ]
  };

  Object.entries(groups).forEach(([id, values]) => {
    const el = $(id);
    if (!el || !el.parentElement) return;
    const wrap = el.closest('.adv-text-field') || el.parentElement;
    let box = wrap.querySelector('.adv-suggestions');
    if (!box) {
      box = document.createElement('div');
      box.className = 'adv-suggestions';
      el.insertAdjacentElement('afterend', box);
    }
    const render = () => {
      const q = (el.value || '').trim().toLowerCase();
      const used = new Set((el.value || '').split(/[,\n]/).map(x => x.trim().toLowerCase()).filter(Boolean));
      const matches = values.filter(v => !used.has(v.toLowerCase()) && (!q || v.toLowerCase().includes(q) || v.toLowerCase().split(/\s+/).some(w => w.startsWith(q)))).slice(0, 6);
      box.innerHTML = matches.map(v => `<button type="button" class="adv-suggestion" data-value="${esc(v)}">${esc(v)}</button>`).join('');
      box.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
        const value = btn.dataset.value || '';
        const current = el.value.trim();
        el.value = current ? `${current.replace(/[ ,]+$/, '')}, ${value}` : value;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.focus();
        // Hide the suggestion list after a pick instead of re-rendering
        // it (the input/focus listeners above already re-ran render()
        // synchronously, so clearing it last is what actually sticks).
        box.innerHTML = '';
      }));
    };
    el.addEventListener('focus', render);
    el.addEventListener('input', render);
    el.addEventListener('blur', () => setTimeout(() => { box.innerHTML = ''; }, 180));
  });
})();

/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let config = {};
let lastHistoryId = null;
let lastGeneratedPayload = null;

// V7.6 safe bridge for optional enhancement UI without exposing internal state as globals.
Object.defineProperty(window, "__editPromptState", {
  configurable: true,
  value: {},
});
Object.defineProperty(window.__editPromptState, "lastHistoryId", { get: () => lastHistoryId, set: (v) => { lastHistoryId = v; } });
Object.defineProperty(window.__editPromptState, "mediaState", { get: () => mediaState });

let pendingEmail = "";
let pendingName = "";

/* =========================================================
   PROMPT CLEANUP
========================================================= */

function cleanGeneratedPrompt(text) {
  if (!text) return "";

  let result = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  result = result
    .replace(/^```(?:text|markdown)?/i, "")
    .replace(/```$/i, "")
    .trim();

  result = result.replace(
    /\b(\w+)(\s+\1\b)+/gi,
    "$1",
  );

  result = result.replace(
    /\b((?:\w+\s+){1,2}\w+)(\s+\1\b)+/gi,
    "$1",
  );

  result = result
    .replace(/,\s*,+/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+:/g, ":")
    .replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/* =========================================================
   USER
========================================================= */

async function refreshUser() {
  try {
    const response = await apiFetch(
      "/api/me",
    );

    const data =
      await readJson(response);

    currentUser = response.ok
      ? data.user || null
      : null;
  } catch (error) {
    console.error(
      "User refresh failed:",
      error,
    );

    currentUser = null;
  }

  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  const dashboard = $("dashboard");
  const historyHint = $("historyHint");

  loginBtn?.classList.toggle(
    "hide",
    Boolean(currentUser),
  );

  logoutBtn?.classList.toggle(
    "hide",
    !currentUser,
  );

  dashboard?.classList.toggle(
    "hide",
    !currentUser,
  );

  if (historyHint) {
    historyHint.textContent =
      currentUser
        ? "✓ Your generated prompts are being saved to your personal history."
        : "Log in to automatically save generated prompts.";
  }

  if (currentUser) {
    await loadDashboard();
  }
}

/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {
  if (!currentUser) return;

  try {
    const data =
      await apiRequest(
        "/api/dashboard",
      );

    const stats =
      data.stats || {};

    const dashboardStats =
      $("dashboardStats");

    if (dashboardStats) {
      dashboardStats.innerHTML = [
        [
          "🪄",
          "Prompts",
          stats.promptCount || 0,
        ],
        [
          "⭐",
          "Favorites",
          stats.favorites || 0,
        ],
        [
          "🛍️",
          "Purchases",
          stats.purchases || 0,
        ],
        [
          "₹",
          "Spent",
          Number(
            stats.spent || 0,
          ).toFixed(0),
        ],
      ]
        .map(
          ([icon, label, value]) => `
            <div class="statcard">
              <span>${icon}</span>
              <b>${esc(value)}</b>
              <small>${esc(label)}</small>
            </div>
          `,
        )
        .join("");
    }

    renderHistory(
      Array.isArray(data.recent)
        ? data.recent
        : [],
    );
  } catch (error) {
    console.error(
      "Dashboard error:",
      error,
    );

    renderHistory([]);

    if (currentUser) {
      toast(
        error.message ||
          "Dashboard could not be loaded",
      );
    }
  }
}

/* =========================================================
   HISTORY
========================================================= */

function renderHistory(items) {
  const box = $("recentPrompts");

  if (!box) return;

  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    box.innerHTML = `
      <p class="muted">
        No prompts yet. Generate your first one above.
      </p>
    `;

    return;
  }

  const promptMap = new Map();

  items.forEach((item) => {
    promptMap.set(
      String(item.id ?? ""),
      String(item.prompt ?? ""),
    );
  });

  box.innerHTML = items
    .map((item) => {
      const id = String(
        item.id ?? "",
      );

      return `
        <div class="historyitem">

          <div>
            <b>${esc(
              item.subject ||
                "Untitled prompt",
            )}</b>

            <small>
              ${
                item.created_at
                  ? esc(
                      new Date(
                        item.created_at,
                      ).toLocaleString(),
                    )
                  : ""
              }
            </small>
          </div>

          <p>${esc(
            item.prompt || "",
          )}</p>

          <div class="historyactions">

            <button
              type="button"
              class="btn ghost small fav"
              data-id="${esc(id)}"
              title="Favorite"
              aria-label="Favorite prompt"
            >
              ${
                Number(item.favorite)
                  ? "★"
                  : "☆"
              }
            </button>

            <button
              type="button"
              class="btn ghost small copyHistory"
              data-id="${esc(id)}"
            >
              Copy
            </button>

            <button
              type="button"
              class="btn ghost small deleteHistory"
              data-id="${esc(id)}"
            >
              Delete
            </button>

          </div>

        </div>
      `;
    })
    .join("");

  box
    .querySelectorAll(".fav")
    .forEach((button) => {
      button.onclick = () =>
        toggleFavorite(
          button.dataset.id,
          button,
        );
    });

  box
    .querySelectorAll(".deleteHistory")
    .forEach((button) => {
      button.onclick = async () => {
        const id =
          button.dataset.id;

        if (!id) {
          return toast(
            "Prompt ID missing",
          );
        }

        if (!currentUser) {
          openLoginModal();

          return toast(
            "Please log in first",
          );
        }

        const confirmed =
          window.confirm(
            "Delete this prompt from your history?",
          );

        if (!confirmed) return;

        const originalText =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Deleting…";

        try {
          await apiRequest(
            `/api/prompts/${encodeURIComponent(
              id,
            )}`,
            {
              method: "DELETE",
            },
          );

          if (
            String(lastHistoryId) ===
            String(id)
          ) {
            lastHistoryId = null;

            if (
              $("favoriteOutputBtn")
            ) {
              $("favoriteOutputBtn").textContent =
                "☆ Favorite";
            }
          }

          toast("Prompt deleted");

          await loadDashboard();
        } catch (error) {
          toast(
            error.message ||
              "Delete failed",
          );
        } finally {
          button.disabled = false;
          button.textContent =
            originalText;
        }
      };
    });

  box
    .querySelectorAll(".copyHistory")
    .forEach((button) => {
      button.onclick = async () => {
        const id =
          button.dataset.id;

        const prompt =
          promptMap.get(
            String(id),
          ) || "";

        if (!prompt) {
          return toast(
            "Nothing to copy",
          );
        }

        const copied =
          await copyText(prompt);

        toast(
          copied
            ? "Copied ✓"
            : "Copy failed",
        );
      };
    });
}

/* =========================================================
   FAVORITE
========================================================= */

async function toggleFavorite(
  id,
  button,
) {
  if (!currentUser) {
    openLoginModal();

    return toast(
      "Log in to favorite prompts",
    );
  }

  if (!id) {
    return toast(
      "Prompt ID missing. Generate the prompt again.",
    );
  }

  if (!button) return;

  button.disabled = true;

  try {
    const data =
      await apiRequest(
        `/api/prompts/${encodeURIComponent(
          id,
        )}/favorite`,
        {
          method: "POST",
        },
      );

    const isFavorite =
      Boolean(data.favorite);

    if (
      button ===
      $("favoriteOutputBtn")
    ) {
      button.textContent =
        isFavorite
          ? "★ Favorite"
          : "☆ Favorite";
    } else {
      button.textContent =
        isFavorite ? "★" : "☆";
    }

    toast(
      isFavorite
        ? "Added to Favorites ⭐"
        : "Removed from Favorites",
    );

    await loadDashboard();
  } catch (error) {
    toast(
      error.message ||
        "Favorite failed",
    );
  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   CONFIG
========================================================= */

async function loadConfig() {
  try {
    const data =
      await apiRequest(
        "/api/config",
      );

    config = data || {};

    const status = $("status");

    if (!status) return;

    const aiText = config.aiEnabled
      ? `Gemini ${
          config.aiModel || ""
        }`.trim()
      : "local fallback";

    const razorpayText =
      config.razorpayKeyId
        ? "configured"
        : "not configured";

    status.textContent =
      `AI: ${aiText} • Razorpay: ${razorpayText} • History: enabled`;
  } catch (error) {
    console.error(
      "Config error:",
      error,
    );

    config = {};

    if ($("status")) {
      $("status").textContent =
        "Server connection unavailable";
    }
  }
}

/* =========================================================
   LOGIN MODAL
========================================================= */

function resetLoginModal() {
  pendingEmail = "";
  pendingName = "";

  $("loginStep1")?.classList.remove(
    "hide",
  );

  $("loginStep2")?.classList.add(
    "hide",
  );

  if ($("otp")) {
    $("otp").value = "";
  }

  if ($("otpHint")) {
    $("otpHint").textContent =
      "We'll send a 6-digit verification code.";
  }
}

function openLoginModal() {
  const modal = $("loginModal");

  if (!modal) return;

  modal.classList.add("show");

  forceCustomer = false;

  $("loginStepAdmin")?.classList.add("hide");

  $("loginStep1")?.classList.remove(
    "hide",
  );

  $("loginStep2")?.classList.add(
    "hide",
  );

  if ($("otp")) {
    $("otp").value = "";
  }

  if ($("otpHint")) {
    $("otpHint").textContent =
      "We'll send a 6-digit verification code.";
  }

  setTimeout(() => {
    $("name")?.focus();
  }, 50);
}

function closeLoginModal() {
  $("loginModal")?.classList.remove(
    "show",
  );
}

if ($("loginBtn")) {
  $("loginBtn").onclick =
    openLoginModal;
}

if ($("closeLogin")) {
  $("closeLogin").onclick =
    closeLoginModal;
}

if ($("loginModal")) {
  $("loginModal").addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        $("loginModal")
      ) {
        closeLoginModal();
      }
    },
  );
}

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape" &&
      $("loginModal")?.classList.contains(
        "show",
      )
    ) {
      closeLoginModal();
    }
  },
);

/* =========================================================
   SEND OTP
========================================================= */

let forceCustomer = false;

function showAdminStep() {
  $("loginStep1")?.classList.add("hide");
  $("loginStep2")?.classList.add("hide");
  $("loginStepAdmin")?.classList.remove("hide");

  if ($("adminPass")) {
    $("adminPass").value = "";
    $("adminPass").focus();
  }
}

async function adminLogin() {
  const button = $("adminLoginBtn");
  const password = $("adminPass")?.value || "";

  if (!password) {
    return toast("Enter the admin password");
  }

  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    await apiRequest("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: pendingEmail,
        password,
      }),
    });

    location.href = "/admin.html";
  } catch (error) {
    toast(error.message || "Admin login failed");

    button.disabled = false;
    button.textContent = "Login as Admin";
  }
}

if ($("adminLoginBtn")) {
  $("adminLoginBtn").onclick = adminLogin;
}

if ($("adminPass")) {
  $("adminPass").addEventListener("keydown", (event) => {
    if (event.key === "Enter") adminLogin();
  });
}

if ($("adminCustomerBtn")) {
  $("adminCustomerBtn").onclick = () => {
    forceCustomer = true;

    $("loginStepAdmin")?.classList.add("hide");
    $("loginStep1")?.classList.remove("hide");

    toast("Enter your name, then tap Send Code");

    $("name")?.focus();
  };
}

async function sendOtp({
  resend = false,
} = {}) {
  if (!resend) {
    pendingName =
      $("name")?.value.trim() || "";

    pendingEmail =
      $("email")
        ?.value.trim()
        .toLowerCase() || "";
  }

  if (!pendingEmail) {
    return toast(
      "Enter your email",
    );
  }

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailPattern.test(
      pendingEmail,
    )
  ) {
    return toast(
      "Enter a valid email address",
    );
  }

  const button =
    $("sendOtpBtn");

  if (!button) return;

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent = resend
    ? "Resending…"
    : "Sending…";

  try {
    const data =
      await apiRequest(
        "/api/auth/request-otp",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: pendingName,
            email: pendingEmail,
            customer: forceCustomer,
          }),
        },
      );

    if (data.admin) {
      showAdminStep();
      return;
    }

    $("loginStep1")?.classList.add(
      "hide",
    );

    $("loginStep2")?.classList.remove(
      "hide",
    );

    if ($("otp")) {
      $("otp").value = "";
      $("otp").focus();
    }

    if ($("otpHint")) {
      $("otpHint").textContent =
        data.devOtp
          ? `Dev mode — your code is ${data.devOtp}`
          : `Code sent to ${pendingEmail}`;
    }

    toast(
      data.message ||
        (resend
          ? "Code resent"
          : "Code sent"),
    );
  } catch (error) {
    toast(
      error.message ||
        "Could not send code",
    );
  } finally {
    button.disabled = false;
    button.textContent =
      originalText || "Send Code";
  }
}

if ($("sendOtpBtn")) {
  $("sendOtpBtn").onclick =
    () => sendOtp();
}

/* =========================================================
   RESEND OTP
========================================================= */

if ($("resendOtpBtn")) {
  $("resendOtpBtn").onclick =
    async () => {
      if (!pendingEmail) {
        $("loginStep2")?.classList.add(
          "hide",
        );

        $("loginStep1")?.classList.remove(
          "hide",
        );

        return toast(
          "Enter your email first",
        );
      }

      await sendOtp({
        resend: true,
      });
    };
}

/* =========================================================
   VERIFY OTP
========================================================= */

if ($("verifyOtpBtn")) {
  $("verifyOtpBtn").onclick =
    async () => {
      const otp =
        $("otp")?.value.trim() || "";

      if (!/^\d{6}$/.test(otp)) {
        return toast(
          "Enter the 6-digit code",
        );
      }

      if (!pendingEmail) {
        return toast(
          "Please request a code first",
        );
      }

      const button =
        $("verifyOtpBtn");

      const originalText =
        button.textContent;

      button.disabled = true;
      button.textContent =
        "Verifying…";

      try {
        await apiRequest(
          "/api/auth/verify-otp",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              email: pendingEmail,
              otp,
            }),
          },
        );

        closeLoginModal();

        await refreshUser();

        toast("Logged in ✓");

        pendingEmail = "";
        pendingName = "";
      } catch (error) {
        toast(
          error.message ||
            "Verification failed",
        );
      } finally {
        button.disabled = false;
        button.textContent =
          originalText ||
          "Verify & Login";
      }
    };
}

/* =========================================================
   OTP ENTER KEY
========================================================= */

if ($("otp")) {
  $("otp").addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        $("verifyOtpBtn")
      ) {
        event.preventDefault();

        $("verifyOtpBtn").click();
      }
    },
  );
}

/* =========================================================
   LOGOUT
========================================================= */

if ($("logoutBtn")) {
  $("logoutBtn").onclick =
    async () => {
      const button =
        $("logoutBtn");

      const originalText =
        button.textContent;

      button.disabled = true;
      button.textContent =
        "Logging out…";

      try {
        await apiRequest(
          "/api/auth/logout",
          {
            method: "POST",
          },
        );

        currentUser = null;
        lastHistoryId = null;
        lastGeneratedPayload = null;

        await refreshUser();

        toast("Logged out ✓");
      } catch (error) {
        toast(
          error.message ||
            "Logout failed",
        );
      } finally {
        button.disabled = false;
        button.textContent =
          originalText || "Logout";
      }
    };
}

/* =========================================================
   DASHBOARD LINK
========================================================= */

if ($("dashboardLink")) {
  $("dashboardLink").onclick =
    (event) => {
      if (!currentUser) {
        event.preventDefault();

        openLoginModal();

        return toast(
          "Log in to open your dashboard",
        );
      }

      const dashboard =
        $("dashboard");

      if (dashboard) {
        event.preventDefault();

        dashboard.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    };
}

/* =========================================================
   GENERATED PROMPT BOX IS EDITABLE
   Paste a prompt made anywhere else (ChatGPT, Gemini ...) straight into it,
   then use Generate Media.
========================================================= */

(function setupEditableOutput() {
  const box = $("output");

  if (!box) return;

  box.contentEditable = "plaintext-only";

  if (box.contentEditable !== "plaintext-only") {
    box.contentEditable = "true";
  }

  const settle = () => {
    // Emptied by the user? Remove leftovers so the placeholder shows again.
    if (!box.textContent.trim()) box.innerHTML = "";

    // The subject box must not override what was typed/pasted here.
    lastPromptSource = ($("subject")?.value || "").trim();
  };

  // Always paste as plain text so line breaks and sections stay intact.
  box.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");

    if (text == null) return;

    event.preventDefault();

    const selection = window.getSelection();

    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const node = document.createTextNode(text);

      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);

      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      box.textContent += text;
    }

    settle();

    // Ratio and duration written in the pasted prompt are applied at once.
    if (looksLikeFullPrompt(outputText())) {
      syncSettingsFromPrompt(outputText());
    }
  });

  let typingTimer = null;

  box.addEventListener("input", () => {
    settle();

    clearTimeout(typingTimer);

    typingTimer = setTimeout(() => {
      const text = outputText();

      if (looksLikeFullPrompt(text)) syncSettingsFromPrompt(text);
    }, 400);
  });
})();

/* =========================================================
   GENERATE PROMPT
========================================================= */

$("subject")?.addEventListener("input", () => {
  $("subject")?.classList.remove("input-error");
});

if ($("generateBtn")) {
  $("generateBtn").onclick =
    async () => {
      const button =
        $("generateBtn");

      let subject =
        $("subject")
          ?.value.trim() || "";

      // Subject is required. Do not silently fill in a random scene.
      if (!subject) {
        toast("Please enter a subject first ⚠️");

        if ($("subject")) {
          $("subject").classList.add("input-error");
          $("subject").focus();
        }

        return;
      }

      // A complete, ready-made prompt was pasted: use it exactly as written.
      if (looksLikeFullPrompt(subject)) {
        useFullPromptAsIs(subject);

        return toast("Full prompt detected - using it as it is ✓");
      }

      const payload = {
        preset:
          $("preset")?.value || "",

        targetModel:
          $("targetModel")?.value || "",

        subject,

        style:
          styleSelect.values,

        ratio:
          $("ratio")?.value || "",

        camera:
          cameraSelect.values,

        lens:
          $("lens")?.value || "",

        lighting:
          lightingSelect.values,

        duration:
          $("duration")?.value || "",

        fps:
          $("fps")?.value || "",

        mood:
          moodSelect.values,

        environment:
          $("environment")
            ?.value.trim() || "",

        movement:
          $("movement")
            ?.value.trim() || "",

        negative:
          $("negative")
            ?.value.trim() || "",

        ...advancedPayload(),
      };

      lastGeneratedPayload =
        payload;

      button.disabled = true;
      button.textContent =
        "Generating…";

      try {
        const data =
          await apiRequest(
            "/api/generate",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                payload,
              ),
            },
          );

        const finalPrompt =
          cleanGeneratedPrompt(
            data.prompt,
          );

        if (!finalPrompt) {
          throw new Error(
            "AI returned an empty prompt.",
          );
        }

        if ($("output")) {
          $("output").textContent =
            finalPrompt;
        }

        lastPromptSource = subject;

        lastHistoryId =
          data.historyId ||
          null;

        if (
          $("favoriteOutputBtn")
        ) {
          $("favoriteOutputBtn").textContent =
            "☆ Favorite";
        }

        toast(
          data.mode ===
            "ai-gemini"
            ? "AI prompt generated ✨"
            : "Prompt generated ✓",
        );

        if (data.languageNote) {
          toast(data.languageNote);
        }

        if (currentUser) {
          await loadDashboard();
        }
      } catch (error) {
        console.error(
          "Generate error:",
          error,
        );

        toast(
          error.message ||
            "Generation failed",
        );
      } finally {
        button.disabled = false;
        button.textContent =
          "Generate with AI";
      }
    };
}

/* =========================================================
   COPY GENERATED PROMPT
========================================================= */

if ($("copyBtn")) {
  $("copyBtn").onclick =
    async () => {
      const text = outputText();

      if (isPlaceholderPrompt(text)) {
        return toast(
          "Nothing to copy",
        );
      }

      const copied =
        await copyText(text);

      toast(
        copied
          ? "Copied ✓"
          : "Copy failed",
      );
    };
}

/* =========================================================
   FAVORITE GENERATED OUTPUT
========================================================= */

if ($("favoriteOutputBtn")) {
  $("favoriteOutputBtn").onclick =
    () => {
      if (!lastHistoryId) {
        return toast(
          "Generate a prompt first",
        );
      }

      toggleFavorite(
        lastHistoryId,
        $("favoriteOutputBtn"),
      );
    };
}

/* =========================================================
   IMPROVE PROMPT
========================================================= */

if ($("improveBtn")) {
  $("improveBtn").onclick =
    async () => {
      const prompt = outputText();

      if (isPlaceholderPrompt(prompt)) {
        return toast(
          "Generate a prompt first",
        );
      }

      const button =
        $("improveBtn");

      const originalText =
        button.textContent;

      button.disabled = true;
      button.textContent =
        "Improving…";

      try {
        const data =
          await apiRequest(
            "/api/improve",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                prompt,

                targetModel:
                  $("targetModel")
                    ?.value || "",
              }),
            },
          );

        const improvedPrompt =
          cleanGeneratedPrompt(
            data.prompt,
          );

        if (!improvedPrompt) {
          throw new Error(
            "Improved prompt is empty.",
          );
        }

        if ($("output")) {
          $("output").textContent =
            improvedPrompt;
        }

        lastHistoryId =
          data.historyId ||
          lastHistoryId;

        if (
          $("favoriteOutputBtn")
        ) {
          $("favoriteOutputBtn").textContent =
            "☆ Favorite";
        }

        toast(
          "Prompt improved ✨",
        );

        if (currentUser) {
          await loadDashboard();
        }
      } catch (error) {
        console.error(
          "Improve error:",
          error,
        );

        toast(
          error.message ||
            "Improve failed",
        );
      } finally {
        button.disabled = false;
        button.textContent =
          originalText || "✨ Improve";
      }
    };
}

/* =========================================================
   SMART PRESETS
========================================================= */

const smartPresets = {
  cinematic: {
    style: [
      "Cinematic",
      "Photorealistic",
    ],
    camera: [
      "Slow push-in",
    ],
    lighting: [
      "Warm cinematic",
    ],
    mood: [
      "Mysterious and dramatic",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A cinematic character walking through a rain-lit city street at night",
  },

  reel: {
    style: [
      "Cinematic",
      "Social Media",
    ],
    camera: [
      "Handheld tracking",
    ],
    lighting: [
      "Neon night",
    ],
    mood: [
      "Energetic and modern",
    ],
    ratio: "9:16 Vertical",
    duration: "8 seconds",
    fps: "30 fps",
    subject:
      "A creator performing a fast and visually engaging transition for a social media short",
  },

  commercial: {
    style: [
      "Commercial",
      "Photorealistic",
    ],
    camera: [
      "Orbit around subject",
    ],
    lighting: [
      "Studio commercial",
    ],
    mood: [
      "Premium and confident",
    ],
    ratio: "1:1 Square",
    duration: "5 seconds",
    fps: "30 fps",
    subject:
      "A premium product rotating on a reflective studio pedestal",
  },

  corporate: {
    style: [
      "Commercial",
    ],
    camera: [
      "Dolly left to right",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Professional",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A confident professional presenting a business idea inside a modern glass office",
  },

  luxury: {
    style: [
      "Luxury Commercial",
    ],
    camera: [
      "Dolly left to right",
    ],
    lighting: [
      "Dramatic low-key",
      "Rim lighting",
    ],
    mood: [
      "Elegant and luxurious",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A luxury product displayed on dark marble with refined studio lighting",
  },

  wedding: {
    style: [
      "Wedding Film",
      "Cinematic",
    ],
    camera: [
      "Crane reveal",
    ],
    lighting: [
      "Warm cinematic",
      "Golden hour",
    ],
    mood: [
      "Emotional and heartfelt",
    ],
    ratio: "4:5 Portrait",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A newlywed couple sharing a natural candid moment during golden hour",
  },

  travel: {
    style: [
      "Travel",
      "Cinematic",
    ],
    camera: [
      "Crane reveal",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Inspiring",
    ],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    fps: "24 fps",
    subject:
      "A cinematic mountain landscape at sunrise with mist moving through the valley",
  },

  fashion: {
    style: [
      "Fashion Film",
      "Editorial",
    ],
    camera: [
      "Tracking shot",
    ],
    lighting: [
      "Soft diffused lighting",
    ],
    mood: [
      "Elegant and luxurious",
    ],
    ratio: "9:16 Vertical",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A fashion model walking through a modern architectural location",
  },

  music: {
    style: [
      "Cinematic",
      "Epic",
    ],
    camera: [
      "Orbit around subject",
    ],
    lighting: [
      "Neon night",
    ],
    mood: [
      "Energetic and modern",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "30 fps",
    subject:
      "A musician performing in a futuristic neon-lit environment",
  },

  documentary: {
    style: [
      "Documentary",
      "Photorealistic",
    ],
    camera: [
      "Static hero shot",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Raw and realistic",
    ],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    fps: "24 fps",
    subject:
      "A local artisan creating handmade products inside a sunlit traditional workshop",
  },

  action: {
    style: [
      "Cinematic",
      "Dark Cinematic",
    ],
    camera: [
      "Tracking shot",
      "Handheld tracking",
    ],
    lighting: [
      "Dramatic low-key",
    ],
    mood: [
      "Epic and powerful",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "An action hero running through a dramatic urban environment",
  },

  sports: {
    style: [
      "Cinematic",
      "Photorealistic",
    ],
    camera: [
      "Tracking shot",
    ],
    lighting: [
      "Hard directional lighting",
    ],
    mood: [
      "Energetic and modern",
    ],
    ratio: "16:9 Landscape",
    duration: "8 seconds",
    fps: "60 fps",
    subject:
      "An athlete sprinting through a professional stadium during an intense competition",
  },

  food: {
    style: [
      "Food",
      "Commercial",
      "Photorealistic",
    ],
    camera: [
      "Static hero shot",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Joyful and vibrant",
    ],
    ratio: "1:1 Square",
    duration: "8 seconds",
    fps: "30 fps",
    subject:
      "A beautifully plated gourmet dish with steam rising naturally on a premium dining table",
  },

  automotive: {
    style: [
      "Commercial",
      "Cinematic",
    ],
    camera: [
      "Dolly forward",
    ],
    lighting: [
      "Dramatic low-key",
    ],
    mood: [
      "Premium and confident",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A premium sports car driving through a modern city at night",
  },

  realestate: {
    style: [
      "Photorealistic",
      "Commercial",
    ],
    camera: [
      "Slow push-in",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Elegant and luxurious",
    ],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    fps: "24 fps",
    subject:
      "A luxurious modern home interior with natural light entering through floor-to-ceiling windows",
  },

  "social-ad": {
    style: [
      "Commercial",
      "Social Media",
    ],
    camera: [
      "Tracking shot",
    ],
    lighting: [
      "Studio commercial",
    ],
    mood: [
      "Energetic and modern",
    ],
    ratio: "9:16 Vertical",
    duration: "8 seconds",
    fps: "30 fps",
    subject:
      "A modern product being demonstrated in a visually engaging social media advertisement",
  },

  "brand-film": {
    style: [
      "Cinematic",
      "Luxury Commercial",
    ],
    camera: [
      "Slow push-in",
    ],
    lighting: [
      "Warm cinematic",
    ],
    mood: [
      "Premium and confident",
    ],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    fps: "24 fps",
    subject:
      "A premium brand story unfolding inside a sophisticated modern environment",
  },

  "fashion-editorial": {
    style: [
      "Fashion Film",
      "Editorial",
    ],
    camera: [
      "Orbit around subject",
    ],
    lighting: [
      "Soft diffused lighting",
    ],
    mood: [
      "Elegant and luxurious",
    ],
    ratio: "4:5 Portrait",
    duration: "10 seconds",
    fps: "24 fps",
    subject:
      "A high-fashion model posing and walking through an artistic editorial location",
  },

  "travel-film": {
    style: [
      "Travel",
      "Cinematic",
      "Photorealistic",
    ],
    camera: [
      "Aerial drone shot",
    ],
    lighting: [
      "Golden hour",
    ],
    mood: [
      "Inspiring",
    ],
    ratio: "21:9 Cinematic",
    duration: "15 seconds",
    fps: "24 fps",
    subject:
      "A breathtaking natural landscape captured during golden hour with atmospheric mist",
  },
};

/* =========================================================
   APPLY SMART PRESET
========================================================= */

if ($("preset")) {
  $("preset").onchange = () => {
    const preset =
      smartPresets[
        $("preset").value
      ];

    if (!preset) return;

    styleSelect.selectValues(
      preset.style || [],
    );

    cameraSelect.selectValues(
      preset.camera || [],
    );

    lightingSelect.selectValues(
      preset.lighting || [],
    );

    moodSelect.selectValues(
      preset.mood || [],
    );

    if (
      preset.ratio &&
      $("ratio")
    ) {
      $("ratio").value =
        preset.ratio;
    }

    if (
      preset.duration &&
      $("duration")
    ) {
      $("duration").value =
        preset.duration;
    }

    if (
      preset.fps &&
      $("fps")
    ) {
      $("fps").value =
        preset.fps;
    }

    if (
      preset.subject &&
      $("subject")
    ) {
      $("subject").value =
        preset.subject;
    }

    $("subject")?.focus();

    toast("Preset applied ✓");
  };
}

/* =========================================================
   ASPECT RATIO TOOL
========================================================= */

const ratioMap = {
  "9/16": 9 / 16,
  "16/9": 16 / 9,
  "1": 1,
  "4/5": 4 / 5,
};

if ($("ratioBtn")) {
  $("ratioBtn").onclick = () => {
    const width =
      parseFloat(
        $("width")?.value || "",
      );

    const ratio =
      ratioMap[
        $("rc")?.value
      ];

    if (
      !width ||
      width <= 0 ||
      !ratio
    ) {
      if ($("ratioOut")) {
        $("ratioOut").textContent =
          "Enter a valid width.";
      }

      return;
    }

    const height =
      width / ratio;

    if ($("ratioOut")) {
      $("ratioOut").textContent =
        `${Math.round(
          width,
        )} × ${Math.round(
          height,
        )} px`;
    }
  };
}

/* =========================================================
   FILE SIZE TOOL
========================================================= */

if ($("sizeBtn")) {
  $("sizeBtn").onclick = () => {
    const bitrate =
      parseFloat(
        $("bitrate")?.value || "",
      );

    const minutes =
      parseFloat(
        $("minutes")?.value || "",
      );

    if (
      !bitrate ||
      bitrate <= 0 ||
      !minutes ||
      minutes <= 0
    ) {
      if ($("sizeOut")) {
        $("sizeOut").textContent =
          "Enter valid values.";
      }

      return;
    }

    const gb =
      (bitrate *
        1e6 *
        minutes *
        60) /
      8 /
      1e9;

    if ($("sizeOut")) {
      $("sizeOut").textContent =
        `Approx. ${gb.toFixed(
          2,
        )} GB`;
    }
  };
}

/* =========================================================
   CAMERA IDEA TOOL
========================================================= */

const moves = [
  "Slow push-in with subtle parallax and shallow depth of field.",

  "Smooth 180° orbit around the subject with stable identity.",

  "Low-angle dolly-forward reveal with strong foreground depth.",

  "Gentle crane-down from a wide establishing shot into a medium hero frame.",

  "Sideways tracking shot matching the subject's natural movement.",

  "Slow cinematic pull-back revealing the full environment.",

  "Smooth handheld tracking movement with realistic micro-motion.",

  "Controlled overhead reveal transitioning into a cinematic medium shot.",

  "Slow lateral camera slide with subtle depth separation.",

  "Dynamic follow-cam movement maintaining consistent subject framing.",
];

if ($("ideaBtn")) {
  $("ideaBtn").onclick = () => {
    const index =
      Math.floor(
        Math.random() *
          moves.length,
      );

    if ($("ideaOut")) {
      $("ideaOut").textContent =
        moves[index];
    }
  };
}

/* =========================================================
   CATEGORY PRESETS
========================================================= */

const categoryPresets = {
  Cinematic: {
    style: ["Cinematic"],
    camera: ["Slow push-in"],
    lighting: ["Warm cinematic"],
    mood: [
      "Mysterious and dramatic",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    subject:
      "A lone character walking through a rain-lit city street at night",
  },

  "Social Media": {
    style: ["Social Media"],
    camera: [
      "Handheld tracking",
    ],
    lighting: ["Neon night"],
    mood: [
      "Energetic and modern",
    ],
    ratio: "9:16 Vertical",
    duration: "8 seconds",
    subject:
      "A creator performing a quick trending transition for a social media short",
  },

  Commercial: {
    style: ["Commercial"],
    camera: [
      "Orbit around subject",
    ],
    lighting: [
      "Studio commercial",
    ],
    mood: [
      "Premium and confident",
    ],
    ratio: "1:1 Square",
    duration: "5 seconds",
    subject:
      "A sleek smartphone rotating on a reflective studio pedestal",
  },

  Wedding: {
    style: ["Wedding Film"],
    camera: ["Crane reveal"],
    lighting: [
      "Warm cinematic",
      "Golden hour",
    ],
    mood: [
      "Emotional and heartfelt",
    ],
    ratio: "4:5 Portrait",
    duration: "10 seconds",
    subject:
      "A bride and groom sharing a candid laugh during golden hour",
  },

  Luxury: {
    style: [
      "Luxury Commercial",
    ],
    camera: [
      "Dolly left to right",
    ],
    lighting: [
      "Dramatic low-key",
      "Rim lighting",
    ],
    mood: [
      "Elegant and luxurious",
    ],
    ratio: "16:9 Landscape",
    duration: "10 seconds",
    subject:
      "An elegant luxury watch resting on dark marble under refined studio lighting",
  },

  Documentary: {
    style: ["Documentary"],
    camera: [
      "Static hero shot",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Raw and realistic",
    ],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    subject:
      "A local artisan carving wood inside a sunlit traditional workshop",
  },

  Food: {
    style: ["Food"],
    camera: [
      "Static hero shot",
    ],
    lighting: [
      "Soft natural daylight",
    ],
    mood: [
      "Joyful and vibrant",
    ],
    ratio: "1:1 Square",
    duration: "8 seconds",
    subject:
      "Steam rising naturally from a beautifully plated gourmet dish",
  },

  Travel: {
    style: ["Travel"],
    camera: ["Crane reveal"],
    lighting: ["Golden hour"],
    mood: ["Inspiring"],
    ratio: "16:9 Landscape",
    duration: "15 seconds",
    subject:
      "A scenic mountain road at sunrise with mist rolling through valleys",
  },
};

/* =========================================================
   CATEGORY CLICK
========================================================= */

document
  .querySelectorAll(
    ".categorygrid button",
  )
  .forEach((button) => {
    button.onclick = () => {
      const category =
        button.dataset.cat;

      const preset =
        categoryPresets[
          category
        ];

      if (preset) {
        styleSelect.selectValues(
          preset.style || [],
        );

        cameraSelect.selectValues(
          preset.camera || [],
        );

        lightingSelect.selectValues(
          preset.lighting || [],
        );

        moodSelect.selectValues(
          preset.mood || [],
        );

        if (
          $("ratio") &&
          preset.ratio
        ) {
          $("ratio").value =
            preset.ratio;
        }

        if (
          $("duration") &&
          preset.duration
        ) {
          $("duration").value =
            preset.duration;
        }

        if (
          $("subject") &&
          preset.subject
        ) {
          $("subject").value =
            preset.subject;
        }
      }

      document
        .querySelectorAll(
          ".categorygrid button",
        )
        .forEach((item) => {
          item.classList.toggle(
            "active",
            item === button,
          );
        });

      $("generator")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      toast(
        `${category} selected ✓`,
      );
    };
  });

/* =========================================================
   DASHBOARD REFRESH
========================================================= */

if ($("refreshDashboard")) {
  $("refreshDashboard").onclick =
    async () => {
      if (!currentUser) {
        openLoginModal();

        return toast(
          "Log in to refresh dashboard",
        );
      }

      const button =
        $("refreshDashboard");

      const originalText =
        button.textContent;

      button.disabled = true;
      button.textContent =
        "Refreshing…";

      try {
        await loadDashboard();
      } finally {
        button.disabled = false;
        button.textContent =
          originalText;
      }
    };
}

/* =========================================================
   RAZORPAY PURCHASE
========================================================= */

document
  .querySelectorAll(".buy")
  .forEach((button) => {
    button.onclick =
      async () => {
        if (!currentUser) {
          openLoginModal();

          return toast(
            "Log in before checkout",
          );
        }

        const productId =
          button.dataset.id;

        if (!productId) {
          return toast(
            "Product ID missing",
          );
        }

        const originalText =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Opening Checkout…";

        let checkoutOpened = false;

        try {
          const data =
            await apiRequest(
              "/api/create-order",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  productId,
                }),
              },
            );

          if (!window.Razorpay) {
            throw new Error(
              "Razorpay Checkout unavailable. Please refresh the page and try again.",
            );
          }

          if (
            !data.keyId ||
            !data.orderId ||
            !data.amount
          ) {
            throw new Error(
              "Invalid payment order received from server.",
            );
          }

          let verificationStarted =
            false;

          const restoreButton =
            () => {
              button.disabled =
                false;

              button.textContent =
                originalText;
            };

          const options = {
            key: data.keyId,

            amount: data.amount,

            currency:
              data.currency ||
              "INR",

            name:
              "EditPrompt.in",

            description:
              data.productName ||
              "EditPrompt digital product",

            order_id:
              data.orderId,

            prefill: {
              name:
                currentUser.name ||
                pendingName ||
                "",

              email:
                currentUser.email ||
                pendingEmail ||
                "",
            },

            theme: {
              color: "#E52329",
            },

            modal: {
              ondismiss: () => {
                if (
                  !verificationStarted
                ) {
                  toast(
                    "Checkout closed",
                  );
                }

                restoreButton();
              },
            },

            handler:
              async (
                razorpayResponse,
              ) => {
                verificationStarted =
                  true;

                button.disabled = true;
                button.textContent =
                  "Verifying Payment…";

                try {
                  const verification =
                    await apiRequest(
                      "/api/verify-payment",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type":
                            "application/json",
                        },
                        body:
                          JSON.stringify({
                            ...razorpayResponse,
                            productId:
                              data.productId ||
                              productId,
                          }),
                      },
                    );

                  if (
                    !verification.verified
                  ) {
                    throw new Error(
                      verification.error ||
                        "Payment verification failed",
                    );
                  }

                  toast(
                    "Payment verified ✓",
                  );

                  setTimeout(() => {
                    window.location.href =
                      "/library.html?paid=" +
                      encodeURIComponent(
                        data.productId || productId,
                      );
                  }, 700);
                } catch (error) {
                  console.error(
                    "Payment verification error:",
                    error,
                  );

                  toast(
                    error.message ||
                      "Payment verification failed",
                  );

                  restoreButton();
                }
              },
          };

          const razorpay =
            new window.Razorpay(
              options,
            );

          razorpay.on(
            "payment.failed",
            (event) => {
              const description =
                event?.error
                  ?.description;

              toast(
                description ||
                  "Payment failed. Please try again.",
              );

              restoreButton();
            },
          );

          razorpay.open();

          checkoutOpened = true;
        } catch (error) {
          console.error(
            "Checkout error:",
            error,
          );

          toast(
            error.message ||
              "Checkout could not be opened",
          );
        } finally {
          /*
           * Do not immediately reset the button
           * while Razorpay checkout is open.
           */
          if (!checkoutOpened) {
            button.disabled = false;
            button.textContent =
              originalText;
          }
        }
      };
  });

/* =========================================================
   INITIALIZATION
========================================================= */

(async function init() {
  try {
    await loadConfig();
    await refreshUser();

    if (
      !currentUser &&
      new URLSearchParams(location.search).get("login") === "1"
    ) {
      openLoginModal();
      history.replaceState(null, "", location.pathname + location.hash);
    }
  } catch (error) {
    console.error(
      "App initialization failed:",
      error,
    );
  }
})();
/* =========================================================
   AI MEDIA STUDIO
   Prompt -> Select Type -> Generate -> Preview -> Download
   Image flow also offers: Animate Image -> Image-to-Video
========================================================= */

// Keep only one Video Controls panel if an older/merged UI accidentally
// contains the section more than once. The first panel is the canonical one.
function dedupeVideoControls() {
  const panels = document.querySelectorAll('#videoControls');
  if (panels.length <= 1) return;

  panels.forEach((panel, index) => {
    if (index > 0) panel.remove();
  });
}

dedupeVideoControls();

const mediaState = {
  type: "image",
  kind: null,
  file: null,
  url: null,
  downloadUrl: null,
  sourceImageFile: null,
  uploadedImageFile: null,
  uploadedImageUrl: null,
  lastVideoMeta: null,
  batch: null,
  selectedIndex: 0,
  jobId: null,
  polling: false,
  cancelled: false,
  progressTimer: null,
  progress: 0,
};

function mediaShowStep(step) {
  const steps = {
    type: $("mediaStepType"),
    loading: $("mediaStepLoading"),
    preview: $("mediaStepPreview"),
  };

  Object.entries(steps).forEach(([name, node]) => {
    if (!node) return;

    node.classList.toggle("hide", name !== step);
  });
}

function mediaSetProgress(percent, text) {
  const fill = $("mediaProgressFill");
  const label = $("mediaProgressText");

  if (fill) fill.style.width = `${Math.min(99, Math.max(2, percent))}%`;
  if (label && text) label.textContent = text;
}

function mediaStartProgress(estimatedSeconds, label) {
  mediaState.progress = 0;

  clearInterval(mediaState.progressTimer);

  const step = 95 / Math.max(6, estimatedSeconds);

  mediaSetProgress(3, label);

  mediaState.progressTimer = setInterval(() => {
    mediaState.progress = Math.min(95, mediaState.progress + step);

    mediaSetProgress(mediaState.progress);
  }, 1000);
}

function mediaStopProgress() {
  clearInterval(mediaState.progressTimer);

  mediaState.progressTimer = null;
}

function mediaUpdateGenerateLabel() {
  const button = $("mediaGenerateBtn");

  if (!button) return;

  button.textContent =
    mediaState.type === "video"
      ? "⚡ Generate Video"
      : "⚡ Generate Image";
}

function mediaCurrentPrompt() {
  return outputText();
}

function mediaRenderPreview({ kind, url, file = "" }) {
  const holder = $("mediaPreview");

  if (!holder) return;

  holder.innerHTML = "";

  // GIF is an image format, not a <video> source, so using <video> here
  // prevents the animation from playing. Render GIF results as <img>; the
  // browser will animate them automatically. MP4/WebM/MOV still use <video>.
  const mediaName = String(file || url || "").split("?")[0].toLowerCase();
  const isAnimatedGif = mediaName.endsWith(".gif");

  if (kind === "video" && !isAnimatedGif) {
    const video = document.createElement("video");

    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;
    video.preload = "metadata";

    holder.appendChild(video);
  } else {
    const image = document.createElement("img");

    image.src = url;
    image.alt = kind === "video" ? "AI generated animated video" : "AI generated image";
    image.decoding = "async";

    holder.appendChild(image);
  }
}

function mediaRenderBatch(images, selectedIndex) {
  const holder = $("mediaBatch");

  if (!holder) return;

  if (!images || images.length < 2) {
    holder.classList.add("hide");
    holder.innerHTML = "";
    return;
  }

  holder.classList.remove("hide");
  holder.innerHTML = "";

  const label = document.createElement("div");
  label.className = "mediabatch-label";
  label.textContent = "Choose one image, then download it:";
  holder.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "mediabatch-grid";

  images.forEach((img, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "mediabatch-tile" + (index === selectedIndex ? " is-selected" : "");
    tile.setAttribute("aria-pressed", String(index === selectedIndex));
    tile.setAttribute("aria-label", `Select image ${index + 1}`);

    const thumb = document.createElement("img");
    thumb.src = img.url;
    thumb.alt = `Option ${index + 1}`;
    thumb.loading = "lazy";
    thumb.decoding = "async";

    const badge = document.createElement("span");
    badge.className = "mediabatch-badge";
    badge.textContent = index === selectedIndex ? `✓ ${index + 1}` : String(index + 1);

    tile.appendChild(thumb);
    tile.appendChild(badge);

    tile.onclick = () => mediaSelectBatchItem(index);

    grid.appendChild(tile);
  });

  holder.appendChild(grid);
}

function mediaSelectBatchItem(index) {
  const images = mediaState.batch || [];
  const img = images[index];

  if (!img) return;

  mediaState.selectedIndex = index;
  mediaState.file = img.file;
  mediaState.url = img.url;
  mediaState.downloadUrl = img.downloadUrl;
  mediaState.sourceImageFile = img.file;

  mediaRenderPreview({ kind: "image", url: img.url, file: img.file });

  const download = $("mediaDownloadBtn");
  if (download) {
    download.href = img.downloadUrl;
    download.textContent = "⬇ Download Image";
  }

  const animate = $("mediaAnimateBtn");
  if (animate) animate.disabled = false;

  mediaRenderBatch(images, index);
}

function mediaShowResult({ kind, file, url, downloadUrl, batch = null }) {
  mediaStopProgress();

  mediaState.kind = kind;
  mediaState.file = file;
  mediaState.url = url;
  mediaState.downloadUrl = downloadUrl;
  mediaState.batch = kind === "image" && batch ? batch : null;
  mediaState.selectedIndex = 0;

  // Image batch: show the picker and keep the chosen tile in the preview.
  mediaRenderBatch(mediaState.batch, 0);

  if (kind === "image") {
    mediaState.sourceImageFile = file;
  }

  mediaRenderPreview({ kind, url, file });

  const download = $("mediaDownloadBtn");

  if (download) {
    download.href = downloadUrl;

    download.textContent =
      kind === "video" ? "⬇ Download Video" : "⬇ Download Image";
  }

  const animate = $("mediaAnimateBtn");

  if (animate) {
    animate.classList.toggle("hide", kind !== "image");
    animate.disabled = false;
    animate.textContent = "🎬 Animate Image";
  }

  mediaShowStep("preview");
}

function mediaFail(message) {
  mediaStopProgress();

  const raw = String(message || "Media generation failed");
  let friendly = raw;

  if (raw.includes("Hugging Face free video credits are exhausted")) {
    friendly = "⚠️ Hugging Face free video credits are exhausted. No free remote video credits are currently available.";
  } else if (raw.includes("Pollinations balance is 0")) {
    friendly = "⚠️ Pollinations has 0 balance. Configure a funded video provider.";
  } else if (raw.includes("No video provider is currently available")) {
    friendly = "⚠️ No video provider is currently available. Configure a supported video provider.";
  }

  toast(friendly);

  const oldRetry = document.getElementById("v76RetryBtn");
  if (oldRetry) oldRetry.remove();
  if (mediaState.jobId) {
    const retry = document.createElement("button");
    retry.id = "v76RetryBtn";
    retry.className = "btn ghost small";
    retry.type = "button";
    retry.textContent = "↻ Retry Video";
    retry.onclick = async () => {
      retry.disabled = true;
      try {
        const data = await apiRequest(`/api/media/video/${mediaState.jobId}/retry`, { method: "POST" });
        mediaState.jobId = data.jobId;
        mediaState.cancelled = false;
        mediaState.polling = false;
        mediaShowStep("loading");
        mediaStartProgress(110, "Retrying video…");
        await mediaPollVideo(data.jobId);
      } catch (e) { retry.disabled = false; toast(e.message || "Retry failed"); }
    };
    const target = $("mediaStepType");
    if (target) target.appendChild(retry);
  }

  const animate = $("mediaAnimateBtn");
  if (animate) animate.disabled = false;

  mediaShowStep("type");
}

/* ---------- IMAGE ---------- */

const MEDIA_IMAGE_BATCH_SIZE = 4;

async function mediaGenerateImage() {
  const prompt = mediaCurrentPrompt();

  mediaState.cancelled = false;

  mediaShowStep("loading");

  mediaStartProgress(45, `Generating ${MEDIA_IMAGE_BATCH_SIZE} images…`);

  try {
    const data = await apiRequest("/api/media/image", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        prompt,

        ratio: $("ratio")?.value || "",

        count: MEDIA_IMAGE_BATCH_SIZE,
      }),
    });

    if (mediaState.cancelled) return;

    mediaSetProgress(100, "Done");

    const images = Array.isArray(data.images) && data.images.length
      ? data.images
      : [{ file: data.file, url: data.url, downloadUrl: data.downloadUrl }];

    mediaShowResult({
      kind: "image",
      file: images[0].file,
      url: images[0].url,
      downloadUrl: images[0].downloadUrl,
      batch: images,
    });

    toast("Pick the image you like and download it ✨");
  } catch (error) {
    console.error("Image generation error:", error);

    if (!mediaState.cancelled) mediaFail(error.message);
  }
}

/* ---------- VIDEO ---------- */

async function mediaPollVideo(jobId) {
  mediaState.polling = true;

  const startedAt = Date.now();

  while (mediaState.polling && !mediaState.cancelled) {
    await new Promise((resolve) => setTimeout(resolve, 8000));

    if (mediaState.cancelled) return;

    try {
      const data = await apiRequest(`/api/media/video/${jobId}`);

      if (data.status === "done") {
        mediaState.polling = false;
        mediaState.lastVideoMeta = data;

        mediaSetProgress(100, "Done");

        mediaShowResult({
          kind: "video",
          file: data.file,
          url: data.url,
          downloadUrl: data.downloadUrl,
        });

        const requested = Number(data.requestedDurationSeconds || 0);
        const generated = Number(data.generatedDurationSeconds || 0);
        if (data.provider === "local" && requested > generated + 0.01) {
          toast(`Local preview generated ${generated.toFixed(2)}s of ${requested}s 🎬`);
        } else {
          toast("Video generated 🎬");
        }

        return;
      }

      const elapsed = Math.round((Date.now() - startedAt) / 1000);

      mediaSetProgress(mediaState.progress, `Rendering video… ${elapsed}s`);
    } catch (error) {
      mediaState.polling = false;

      console.error("Video poll error:", error);

      if (!mediaState.cancelled) mediaFail(error.message);

      return;
    }
  }
}

async function mediaGenerateVideo({ fromImage = false } = {}) {
  const prompt = mediaCurrentPrompt();

  mediaState.cancelled = false;

  mediaShowStep("loading");

  mediaStartProgress(
    fromImage ? 140 : 110,
    fromImage ? "Animating your image…" : "Starting video generation…",
  );

  try {
    const data = await apiRequest("/api/media/video", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        prompt,

        ratio: $("ratio")?.value || "",

        duration: $("videoDuration")?.value || $("duration")?.value || "5 seconds",

        fps: $("videoFps")?.value || "24",

        cameraMotion: $("videoCameraMotion")?.value || "Natural",

        motionStrength: $("videoMotionStrength")?.value || "Medium",

        imageFile: fromImage ? (mediaState.uploadedImageFile || mediaState.sourceImageFile) : null,
      }),
    });

    if (mediaState.cancelled) return;

    mediaState.jobId = data.jobId;

    mediaSetProgress(6, "Rendering video… this may take a few minutes");

    await mediaPollVideo(data.jobId);
  } catch (error) {
    console.error("Video generation error:", error);

    if (!mediaState.cancelled) mediaFail(error.message);
  }
}

/* ---------- VIDEO IMAGE UPLOAD ---------- */

let ivThumbUrl = null;
function ivSetThumb(file) {
  const img = $("ivThumb");
  if (ivThumbUrl) { URL.revokeObjectURL(ivThumbUrl); ivThumbUrl = null; }
  if (file && img) {
    ivThumbUrl = URL.createObjectURL(file);
    img.src = ivThumbUrl;
  } else if (img) {
    img.removeAttribute("src");
  }
  $("ivDropPreview")?.classList.toggle("hide", !file);
  $("ivDropEmpty")?.classList.toggle("hide", Boolean(file));
}

async function uploadVideoSourceImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Please select a PNG, JPG, JPEG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image is too large. Maximum size is 8 MB.");
  const status = $("videoImageUploadStatus");
  const clear = $("videoImageClearBtn");
  ivSetThumb(file);
  if (status) status.textContent = "Uploading image…";
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
  const data = await apiRequest("/api/media/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: dataUrl }),
  });
  mediaState.uploadedImageFile = data.file;
  mediaState.uploadedImageUrl = data.url;
  mediaState.sourceImageFile = data.file;
  if (status) status.textContent = `Starting image: ${file.name} · Changes joiye to niche Changes box ma lakho, nahi to seedho video banavo.`;
  if (clear) clear.classList.remove("hide");
  if (typeof ivUpdateLabel === "function") ivUpdateLabel();
}

const videoImageUpload = $("videoImageUpload");
if (videoImageUpload) {
  videoImageUpload.addEventListener("change", async () => {
    try {
      await uploadVideoSourceImage(videoImageUpload.files?.[0]);
      toast("Starting image ready");
    } catch (error) {
      videoImageUpload.value = "";
      ivSetThumb(null);
      const st = $("videoImageUploadStatus");
      if (st) st.textContent = "Optional: upload a starting image, then generate the video.";
      toast(error.message || "Could not upload image");
    }
  });
}

$("videoImageClearBtn")?.addEventListener("click", () => {
  mediaState.uploadedImageFile = null;
  mediaState.uploadedImageUrl = null;
  mediaState.sourceImageFile = null;
  if (videoImageUpload) videoImageUpload.value = "";
  ivSetThumb(null);
  const status = $("videoImageUploadStatus");
  if (status) status.textContent = "Optional: upload a starting image, then generate the video.";
  $("videoImageClearBtn")?.classList.add("hide");
  if (typeof ivUpdateLabel === "function") ivUpdateLabel();
});

/* ---------- AUTO PROMPT ----------
   If nobody has written a prompt yet, one is created automatically so that
   image / video generation always works. */

const FALLBACK_SCENE_IDEAS = [
  "A cinematic character walking through a rain-lit city street at night",
  "A luxury product rotating on a marble pedestal with soft golden light",
  "A drone shot flying over misty mountains at sunrise",
  "An Indian wedding couple sharing a quiet moment under warm festival lights",
  "A futuristic city skyline at dusk with flying vehicles and neon reflections",
];

function randomSceneIdea() {
  let ideas = [];

  try {
    ideas = Object.values(smartPresets || {})
      .map((preset) => preset && preset.subject)
      .filter(Boolean);
  } catch {}

  if (!ideas.length) ideas = FALLBACK_SCENE_IDEAS;

  return ideas[Math.floor(Math.random() * ideas.length)];
}

// The subject text that the current output came from (so a newly pasted
// prompt can be told apart from one that was already turned into output).
let lastPromptSource = "";

// A complete prompt (like the ones this tool creates: "Scene:", "Camera:" ...
// or simply a long paragraph) does not need to be rewritten by the AI.
function looksLikeFullPrompt(text) {
  const t = String(text || "").trim();

  const hasSections =
    /(^|\n)\s*(scene|visual style|camera|lighting|mood|environment|subject movement|quality|negative prompt)\s*:/i.test(t);

  return (hasSections && t.length >= 120) || t.length >= 300;
}

// Reads "9:16" and "8 seconds" out of the prompt and sets the dropdowns,
// so the video really is made in the format the prompt asks for.
function syncSettingsFromPrompt(text) {
  const t = String(text || "");

  const ratioMatch = t.match(/\b(9:16|16:9|1:1|4:5|2:3|21:9|2\.39:1)\b/);
  const durationMatch = t.match(/\b(\d{1,2})\s*seconds?\b/i);

  const pick = (select, startsWith) => {
    if (!select) return;

    const option = [...select.options].find((o) =>
      String(o.value).startsWith(startsWith),
    );

    if (option) select.value = option.value;
  };

  if (ratioMatch) pick($("ratio"), ratioMatch[1]);
  if (durationMatch) {
    pick($("duration"), durationMatch[1] + " seconds");
    pick($("videoDuration"), durationMatch[1] + " seconds");
  }
}

function useFullPromptAsIs(text) {
  const prompt = String(text || "").trim();

  if ($("output")) $("output").textContent = prompt;

  lastPromptSource = prompt;
  lastHistoryId = null;

  syncSettingsFromPrompt(prompt);

  return prompt;
}

// Returns a usable prompt. A pasted full prompt is used directly. When there
// is nothing at all, it fills the subject with a random idea and generates one.
async function ensurePromptForMedia() {
  const typed = $("subject")?.value.trim() || "";
  let prompt = mediaCurrentPrompt();

  if (
    looksLikeFullPrompt(typed) &&
    (isPlaceholderPrompt(prompt) || typed !== lastPromptSource)
  ) {
    return useFullPromptAsIs(typed);
  }

  if (!isPlaceholderPrompt(prompt)) return prompt;

  const subjectBox = $("subject");

  if (subjectBox && !subjectBox.value.trim()) {
    subjectBox.value = randomSceneIdea();
  }

  const generateButton = $("generateBtn");

  if (generateButton && typeof generateButton.onclick === "function") {
    await generateButton.onclick();
  }

  prompt = mediaCurrentPrompt();

  if (!isPlaceholderPrompt(prompt)) return prompt;

  // Prompt generation failed: use the scene text itself so media still works.
  const scene = subjectBox?.value.trim() || randomSceneIdea();

  if ($("output")) $("output").textContent = scene;

  return scene;
}

/* ---------- CONTROLS ---------- */

if ($("generateMediaBtn")) {
  $("generateMediaBtn").onclick = () => {
    if (!currentUser) {
      toast("Log in to generate media");

      return openLoginModal();
    }

    if (config.mediaEnabled === false) {
      return toast("Media generation is not configured on this server");
    }

    const studio = $("mediaStudio");

    if (!studio) return;

    const opening = studio.classList.contains("hide");

    studio.classList.toggle("hide");

    if (opening) {
      mediaShowStep("type");

      mediaUpdateGenerateLabel();

      studio.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };
}

const VIDEO_CAMERA_TO_PROMPT = {
  "Natural": "Natural camera movement",
  "Static": "Static camera",
  "Slow Push In": "Slow push-in",
  "Pull Out": "Slow pull-out",
  "Pan Left": "Pan left",
  "Pan Right": "Pan right",
  "Orbit": "Orbit around subject",
  "Handheld": "Handheld tracking",
};

function syncVideoControlsToPrompt() {
  const cameraMotion = $("videoCameraMotion")?.value || "Natural";
  const motionValue = VIDEO_CAMERA_TO_PROMPT[cameraMotion];
  if (motionValue && cameraSelect?.selectValues) {
    cameraSelect.selectValues([motionValue]);
  }

  const mainDuration = $("duration")?.value || "";
  const videoDuration = $("videoDuration");
  if (videoDuration && /^(5|6|8|10) seconds$/.test(mainDuration)) videoDuration.value = mainDuration;

  const fpsValue = $("videoFps")?.value || "24";
  const promptFps = $("fps");
  if (promptFps) {
    const target = `${fpsValue} fps`;
    const option = [...promptFps.options].find((item) => item.value === target);
    if (option) promptFps.value = target;
  }
}

function updateVideoControls() {
  const isVideo = mediaState.type === "video";
  document.body.classList.toggle("video-generation-active", isVideo);

  const provider = $("mediaProviderStatus");
  if (provider && !isVideo) provider.textContent = "";

  if (isVideo) {
    syncVideoControlsToPrompt();
  }
}

$("videoCameraMotion")?.addEventListener("change", syncVideoControlsToPrompt);
$("videoDuration")?.addEventListener("change", () => {
  const value = $("videoDuration")?.value || "5 seconds";
  const main = $("duration");
  if (main && [...main.options].some((option) => option.value === value)) main.value = value;
});
$("videoFps")?.addEventListener("change", syncVideoControlsToPrompt);
$("videoMotionStrength")?.addEventListener("change", () => {
  // Motion strength is sent directly to the video provider.
});

document.querySelectorAll(".mediatype").forEach((button) => {
  button.onclick = () => {
    document
      .querySelectorAll(".mediatype")
      .forEach((item) => item.classList.remove("active"));

    button.classList.add("active");

    mediaState.type = button.dataset.type || "image";

    updateVideoControls();
    mediaUpdateGenerateLabel();
  };
});

if ($("mediaGenerateBtn")) {
  $("mediaGenerateBtn").onclick = async () => {
    const button = $("mediaGenerateBtn");

    // Pasted a full prompt -> use it directly. No prompt at all -> create one.
    button.disabled = true;

    if (isPlaceholderPrompt(mediaCurrentPrompt())) {
      button.textContent = "Creating prompt…";
    }

    try {
      await ensurePromptForMedia();
    } finally {
      button.disabled = false;
      mediaUpdateGenerateLabel();
    }

    if (isPlaceholderPrompt(mediaCurrentPrompt())) {
      return toast("Could not create a prompt. Please try again.");
    }

    if (mediaState.type === "video") {
      mediaGenerateVideo();
    } else {
      mediaGenerateImage();
    }
  };
}

if ($("mediaAnimateBtn")) {
  $("mediaAnimateBtn").onclick = () => {
    if (!mediaState.sourceImageFile && !mediaState.uploadedImageFile) {
      return toast("Generate or upload an image first");
    }

    $("mediaAnimateBtn").disabled = true;

    mediaGenerateVideo({ fromImage: true });
  };
}

if ($("mediaRegenerateBtn")) {
  $("mediaRegenerateBtn").onclick = () => {
    if (mediaState.kind === "video") {
      mediaGenerateVideo({
        fromImage: Boolean(mediaState.uploadedImageFile || mediaState.sourceImageFile),
      });
    } else {
      mediaGenerateImage();
    }
  };
}

$("mediaCopyPromptBtn")?.addEventListener("click", async () => {
  const prompt = ivState.lastPrompt || mediaCurrentPrompt();
  if (!prompt || isPlaceholderPrompt(prompt)) return toast("No prompt to copy");
  try { await navigator.clipboard.writeText(prompt); toast("Prompt copied"); }
  catch { toast("Could not copy prompt"); }
});

$("mediaShareBtn")?.addEventListener("click", async () => {
  // Always create a real public share token first. A raw localhost media URL
  // only works on the creator's machine and is not a share link.
  let file = String(mediaState.file || "").trim();
  if (!file && mediaState.url) {
    try {
      const pathname = new URL(mediaState.url, location.origin).pathname;
      const match = pathname.match(/\/api\/media\/file\/([^/]+)$/);
      if (match) file = decodeURIComponent(match[1]);
    } catch {}
  }

  if (!file) return toast("Media file required. Generate the media again first.");

  const button = $("mediaShareBtn");
  if (button) button.disabled = true;

  try {
    const data = await apiRequest("/api/media/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file,
        kind: mediaState.kind || "image",
      }),
    });

    const absolute = new URL(data.url, location.origin).href;

    if (navigator.share) {
      await navigator.share({ title: "EditPrompt generated media", url: absolute });
      toast("Share link ready");
    } else {
      await navigator.clipboard.writeText(absolute);
      toast("Public share link copied");
    }
  } catch (error) {
    if (error?.name !== "AbortError") toast(error.message || "Could not create share link");
  } finally {
    if (button) button.disabled = false;
  }
});

if ($("mediaBackBtn")) {
  $("mediaBackBtn").onclick = () => {
    mediaShowStep("type");

    mediaUpdateGenerateLabel();
  };
}

if ($("mediaCancelBtn")) {
  $("mediaCancelBtn").onclick = async () => {
    mediaState.cancelled = true;
    mediaState.polling = false;
    const jobId = mediaState.jobId;
    mediaStopProgress();
    mediaShowStep("type");
    if (jobId) {
      try { await apiRequest(`/api/media/video/${jobId}/cancel`, { method: "POST" }); } catch {}
    }
    toast("Cancelled");
  };
}


/* =========================================================
   IMAGE -> VIDEO SECTION
   Own upload, controls, progress, preview and download.
========================================================= */

const ivState = {
  jobId: null,
  cancelled: false,
  polling: false,
  timer: null,
  progress: 0,
  file: null,
  lastMeta: null,
  lastPrompt: "",
  running: false,
};

const IV_IMAGE_ONLY_PROMPT =
  "Animate the provided image into a realistic, high quality cinematic video. " +
  "Keep the subject, face, composition, colours and visual style exactly as in the image. " +
  "Add natural, smooth motion: subtle subject movement and gentle environmental motion such as wind, light and floating particles. " +
  "Stable, professional camera. No new objects, no text, no distortion or morphing.";

function ivBuildImagePrompt(changes) {
  const text = String(changes || "").trim();
  if (!text) return IV_IMAGE_ONLY_PROMPT;
  return (
    "Animate the provided image into a realistic, high quality cinematic video. " +
    "Keep the subject, face, composition and visual style of the image, except for the changes requested below. " +
    "Requested changes: " + text + ". " +
    "Smooth, natural motion and a stable, professional camera. No text, no distortion or morphing."
  );
}

function ivUpdateLabel() {
  const button = $("ivGenerateBtn");
  if (!button || ivState.running) return;
  button.textContent = mediaState.uploadedImageFile
    ? "⚡ Generate Video from Image"
    : "⚡ Generate Video";
}

function ivShow(step) {
  $("ivProgress")?.classList.toggle("hide", step !== "loading");
  $("ivResult")?.classList.toggle("hide", step !== "result");
  $("ivEmpty")?.classList.toggle("hide", step !== "idle");
  if (step !== "idle") $("ivRetryRow")?.classList.add("hide");
  const button = $("ivGenerateBtn");
  if (button) button.disabled = step === "loading";
  if (step !== "loading") ivUpdateLabel();
}

function ivSetProgress(percent, text) {
  const fill = $("ivProgressFill");
  const label = $("ivProgressText");
  if (fill) fill.style.width = `${Math.min(99, Math.max(2, percent))}%`;
  if (label && text) label.textContent = text;
}

function ivStartProgress(estimatedSeconds, label) {
  ivState.progress = 0;
  clearInterval(ivState.timer);
  const step = 95 / Math.max(6, estimatedSeconds);
  ivSetProgress(3, label);
  ivState.timer = setInterval(() => {
    ivState.progress = Math.min(95, ivState.progress + step);
    ivSetProgress(ivState.progress);
  }, 1000);
}

function ivStopProgress() {
  clearInterval(ivState.timer);
  ivState.timer = null;
}

function ivFriendlyError(message) {
  const raw = String(message || "Video generation failed");
  if (raw.includes("Hugging Face free video credits are exhausted")) {
    return "⚠️ Hugging Face free video credits are exhausted. No free remote video credits are currently available.";
  }
  if (raw.includes("Pollinations balance is 0")) {
    return "⚠️ Pollinations has 0 balance. Configure a funded video provider.";
  }
  if (raw.includes("No video provider is currently available")) {
    return "⚠️ No video provider is currently available. Configure a supported video provider.";
  }
  return raw;
}

function ivFail(message) {
  ivStopProgress();
  ivState.polling = false;
  ivState.running = false;
  toast(ivFriendlyError(message));
  ivShow("idle");
  if (ivState.jobId) $("ivRetryRow")?.classList.remove("hide");
}

function ivShowResult(data) {
  ivStopProgress();
  ivState.running = false;
  ivState.file = data.file;
  ivState.lastMeta = data;

  const holder = $("ivPreview");
  if (holder) {
    holder.innerHTML = "";
    const name = String(data.file || data.url || "").split("?")[0].toLowerCase();
    if (name.endsWith(".gif")) {
      const image = document.createElement("img");
      image.src = data.url;
      image.alt = "AI generated animated video";
      image.decoding = "async";
      image.addEventListener("load", ivLayout);
      holder.appendChild(image);
    } else {
      const video = document.createElement("video");
      video.src = data.url;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", ivLayout);
      holder.appendChild(video);
    }
  }

  const download = $("ivDownloadBtn");
  if (download) download.href = data.downloadUrl || data.url || "#";

  ivShow("result");
  ivLayout();
  $("ivResult")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- RESULT VIEWER: size / frame / fit / fullscreen ---------- */

const ivView = { size: "l", ratio: "auto", fit: "contain" };
const IV_SCALE = { s: 0.45, m: 0.72, l: 1 };
const IV_RATIOS = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };

function ivNaturalRatio() {
  const media = $("ivPreview")?.querySelector("video, img");
  const w = media?.videoWidth || media?.naturalWidth || 0;
  const h = media?.videoHeight || media?.naturalHeight || 0;
  return w && h ? w / h : 9 / 16;
}

function ivLayout() {
  const stage = $("ivStage");
  const frame = $("ivPreview");
  if (!stage || !frame || $("ivResult")?.classList.contains("hide")) return;

  const full = document.fullscreenElement === stage || document.webkitFullscreenElement === stage;
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

  const scale = full ? 1 : IV_SCALE[ivView.size] || 1;
  const boxW = Math.max(120, stage.clientWidth - padX) * scale;
  const boxH = (full ? stage.clientHeight - padY : Math.min(720, window.innerHeight * 0.78)) * scale;
  const ratio = ivView.ratio === "auto" ? ivNaturalRatio() : IV_RATIOS[ivView.ratio] || 9 / 16;

  let w;
  let h;
  if (boxW / boxH > ratio) { h = boxH; w = h * ratio; }
  else { w = boxW; h = w / ratio; }

  frame.style.width = `${Math.round(w)}px`;
  frame.style.height = `${Math.round(h)}px`;
  frame.dataset.fit = ivView.fit;
}

$("ivToolbar")?.addEventListener("click", (event) => {
  const button = event.target.closest(".iv-seg button");
  if (!button) return;
  const group = button.closest(".iv-seg");
  const key = group?.dataset.iv;
  if (!key || !(key in ivView)) return;
  ivView[key] = button.dataset.v;
  group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === button));
  ivLayout();
});

window.addEventListener("resize", ivLayout);
document.addEventListener("fullscreenchange", ivLayout);
document.addEventListener("webkitfullscreenchange", ivLayout);

$("ivFullscreenBtn")?.addEventListener("click", () => {
  const stage = $("ivStage");
  const media = $("ivPreview")?.querySelector("video");
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else if (stage?.requestFullscreen) {
    stage.requestFullscreen().catch(() => toast("Fullscreen not available"));
  } else if (stage?.webkitRequestFullscreen) {
    stage.webkitRequestFullscreen();
  } else if (media?.webkitEnterFullscreen) {
    media.webkitEnterFullscreen();
  } else {
    toast("Fullscreen not supported on this browser");
  }
});

/* Download: fetch the file and save it as a real file (falls back to the plain link). */
$("ivDownloadBtn")?.addEventListener("click", async (event) => {
  const link = event.currentTarget;
  const meta = ivState.lastMeta || {};
  const url = meta.url || meta.downloadUrl;
  if (!url) return;
  event.preventDefault();
  if (link.dataset.busy) return;
  link.dataset.busy = "1";
  const label = link.textContent;
  link.textContent = "Downloading…";
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const ext = (String(meta.file || url).split("?")[0].split(".").pop() || "mp4").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `editprompt-video-${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Video downloaded ⬇");
  } catch (error) {
    console.error("Download error:", error);
    window.location.href = meta.downloadUrl || url;
  } finally {
    link.textContent = label;
    delete link.dataset.busy;
  }
});

/* Drag & drop onto the upload box */
(() => {
  const drop = $("ivDrop");
  const input = $("videoImageUpload");
  if (!drop || !input) return;
  ["dragenter", "dragover"].forEach((name) =>
    drop.addEventListener(name, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((name) =>
    drop.addEventListener(name, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
})();

async function ivPoll(jobId) {
  ivState.polling = true;
  const startedAt = Date.now();

  while (ivState.polling && !ivState.cancelled) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    if (ivState.cancelled) return;

    try {
      const data = await apiRequest(`/api/media/video/${jobId}`);

      if (data.status === "done") {
        ivState.polling = false;
        ivSetProgress(100, "Done");
        ivShowResult(data);

        const requested = Number(data.requestedDurationSeconds || 0);
        const generated = Number(data.generatedDurationSeconds || 0);
        if (data.provider === "local" && requested > generated + 0.01) {
          toast(`Local preview generated ${generated.toFixed(2)}s of ${requested}s 🎬`);
        } else {
          toast("Video generated 🎬");
        }
        return;
      }

      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      ivSetProgress(ivState.progress, `Rendering video… ${elapsed}s`);
    } catch (error) {
      console.error("Video poll error:", error);
      if (!ivState.cancelled) ivFail(error.message);
      return;
    }
  }
}

async function ivGenerate() {
  if (ivState.running) return;

  if (!currentUser) {
    toast("Log in to generate video");
    return openLoginModal();
  }

  if (config.mediaEnabled === false) {
    return toast("Media generation is not configured on this server");
  }

  const button = $("ivGenerateBtn");
  const imageFile = mediaState.uploadedImageFile || null;

  // Changes written in the Image to Video section itself (not the Advanced generator).
  const changes = ($("ivChangesInput")?.value || "").trim();

  ivState.running = true;
  if (button) button.disabled = true;

  let prompt;

  if (imageFile) {
    // Image to Video: the image plus the optional Changes box. The Advanced
    // AI Video Prompt Generator fields are NOT used here.
    prompt = ivBuildImagePrompt(changes);
  } else if (changes) {
    prompt = changes;
  } else {
    if (button && isPlaceholderPrompt(mediaCurrentPrompt())) button.textContent = "Creating prompt…";

    try {
      await ensurePromptForMedia();
    } finally {
      if (button) button.textContent = "⚡ Generate Video";
    }

    if (isPlaceholderPrompt(mediaCurrentPrompt())) {
      ivState.running = false;
      if (button) button.disabled = false;
      return toast("Could not create a prompt. Please try again.");
    }

    syncVideoControlsToPrompt();
    prompt = mediaCurrentPrompt();
  }

  ivState.lastPrompt = prompt;

  ivState.cancelled = false;
  ivState.jobId = null;
  ivShow("loading");
  ivStartProgress(
    imageFile ? 140 : 110,
    imageFile ? "Animating your image…" : "Starting video generation…",
  );

  try {
    const data = await apiRequest("/api/media/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        ratio: $("ratio")?.value || "",
        duration: $("videoDuration")?.value || $("duration")?.value || "5 seconds",
        fps: $("videoFps")?.value || "24",
        cameraMotion: $("videoCameraMotion")?.value || "Natural",
        motionStrength: $("videoMotionStrength")?.value || "Medium",
        imageFile,
      }),
    });

    if (ivState.cancelled) return;

    ivState.jobId = data.jobId;
    ivSetProgress(6, "Rendering video… this may take a few minutes");
    await ivPoll(data.jobId);
  } catch (error) {
    console.error("Video generation error:", error);
    if (!ivState.cancelled) ivFail(error.message);
  }
}

$("ivGenerateBtn")?.addEventListener("click", ivGenerate);
$("ivRegenerateBtn")?.addEventListener("click", ivGenerate);

$("ivCancelBtn")?.addEventListener("click", async () => {
  ivState.cancelled = true;
  ivState.polling = false;
  ivState.running = false;
  const jobId = ivState.jobId;
  ivStopProgress();
  ivShow("idle");
  if (jobId) {
    try { await apiRequest(`/api/media/video/${jobId}/cancel`, { method: "POST" }); } catch {}
  }
  toast("Cancelled");
});

$("ivRetryBtn")?.addEventListener("click", async () => {
  const retry = $("ivRetryBtn");
  if (!ivState.jobId) return;
  retry.disabled = true;
  try {
    const data = await apiRequest(`/api/media/video/${ivState.jobId}/retry`, { method: "POST" });
    ivState.jobId = data.jobId;
    ivState.cancelled = false;
    ivState.polling = false;
    ivState.running = true;
    ivShow("loading");
    ivStartProgress(110, "Retrying video…");
    await ivPoll(data.jobId);
  } catch (error) {
    toast(error.message || "Retry failed");
    ivState.running = false;
    ivShow("idle");
    $("ivRetryRow")?.classList.remove("hide");
  } finally {
    retry.disabled = false;
  }
});

$("ivCopyPromptBtn")?.addEventListener("click", async () => {
  const prompt = ivState.lastPrompt || mediaCurrentPrompt();
  if (!prompt || isPlaceholderPrompt(prompt)) return toast("No prompt to copy");
  try { await navigator.clipboard.writeText(prompt); toast("Prompt copied"); }
  catch { toast("Could not copy prompt"); }
});

$("ivShareBtn")?.addEventListener("click", async () => {
  let file = String(ivState.file || "").trim();
  if (!file && ivState.lastMeta?.url) {
    try {
      const pathname = new URL(ivState.lastMeta.url, location.origin).pathname;
      const match = pathname.match(/\/api\/media\/file\/([^/]+)$/);
      if (match) file = decodeURIComponent(match[1]);
    } catch {}
  }
  if (!file) return toast("Media file required. Generate the video again first.");

  const button = $("ivShareBtn");
  if (button) button.disabled = true;

  try {
    const data = await apiRequest("/api/media/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, kind: "video" }),
    });
    const absolute = new URL(data.url, location.origin).href;

    if (navigator.share) {
      await navigator.share({ title: "EditPrompt generated media", url: absolute });
      toast("Share link ready");
    } else {
      await navigator.clipboard.writeText(absolute);
      toast("Public share link copied");
    }
  } catch (error) {
    if (error?.name !== "AbortError") toast(error.message || "Could not create share link");
  } finally {
    if (button) button.disabled = false;
  }
});


/* =========================
   GENERATOR UI POLISH V7.3
========================= */
(() => {
  const subject = document.getElementById("subject");
  const count = document.getElementById("subjectCount");
  const updateCount = () => {
    if (subject && count) count.textContent = `${subject.value.length} / 1200`;
  };
  subject?.addEventListener("input", updateCount);
  updateCount();

  document.querySelectorAll(".scene-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!subject) return;
      subject.value = chip.dataset.scene || "";
      subject.dispatchEvent(new Event("input", { bubbles: true }));
      subject.focus();
      subject.setSelectionRange(subject.value.length, subject.value.length);
    });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      const button = document.getElementById("generateBtn");
      if (button && !button.disabled) button.click();
    }
  });
})();
