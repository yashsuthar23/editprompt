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

  if (
    !field ||
    !control ||
    !chips ||
    !dropdown
  ) {
    console.warn(
      `MultiSelect missing: ${fieldId}`,
    );

    return {
      values: [],
      selectOnly() {},
      selectValues() {},
      clear() {},
    };
  }

  const checkboxes = [
    ...dropdown.querySelectorAll(
      'input[type="checkbox"]',
    ),
  ];

  let selected = checkboxes
    .filter(
      (checkbox) => checkbox.checked,
    )
    .map((checkbox) => checkbox.value);

  control.setAttribute(
    "role",
    "button",
  );

  control.setAttribute(
    "tabindex",
    "0",
  );

  control.setAttribute(
    "aria-expanded",
    "false",
  );

  function setOpen(open) {
    dropdown.classList.toggle(
      "hide",
      !open,
    );

    control.classList.toggle(
      "open",
      open,
    );

    control.setAttribute(
      "aria-expanded",
      String(open),
    );
  }

  function render() {
    if (!selected.length) {
      chips.innerHTML = `
        <span class="ms-placeholder">
          ${esc(placeholder)}
        </span>
      `;
    } else {
      chips.innerHTML = selected
        .map(
          (value) => `
            <span class="chip">
              ${esc(value)}
              <button
                type="button"
                data-v="${esc(value)}"
                aria-label="Remove ${esc(value)}"
              >×</button>
            </span>
          `,
        )
        .join("");
    }

    chips
      .querySelectorAll("button")
      .forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();

          const value =
            button.dataset.v || "";

          selected = selected.filter(
            (item) => item !== value,
          );

          const checkbox =
            checkboxes.find(
              (item) =>
                item.value === value,
            );

          if (checkbox) {
            checkbox.checked = false;
          }

          render();
        };
      });
  }

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener(
      "change",
      () => {
        if (checkbox.checked) {
          if (
            !selected.includes(
              checkbox.value,
            )
          ) {
            selected.push(
              checkbox.value,
            );
          }
        } else {
          selected = selected.filter(
            (value) =>
              value !==
              checkbox.value,
          );
        }

        render();
      },
    );
  });

  control.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isOpen =
      !dropdown.classList.contains(
        "hide",
      );

    setOpen(!isOpen);
  };

  control.onkeydown = (event) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      control.click();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!field.contains(event.target)) {
        setOpen(false);
      }
    },
  );

  render();

  return {
    get values() {
      return [...selected];
    },

    selectOnly(value) {
      checkboxes.forEach(
        (checkbox) => {
          checkbox.checked =
            checkbox.value === value;
        },
      );

      selected = checkboxes.some(
        (checkbox) =>
          checkbox.value === value,
      )
        ? [value]
        : [];

      render();
    },

    selectValues(values = []) {
      const wanted = Array.isArray(
        values,
      )
        ? values
        : [values];

      checkboxes.forEach(
        (checkbox) => {
          checkbox.checked =
            wanted.includes(
              checkbox.value,
            );
        },
      );

      selected = checkboxes
        .filter(
          (checkbox) =>
            checkbox.checked,
        )
        .map(
          (checkbox) =>
            checkbox.value,
        );

      render();
    },

    clear() {
      checkboxes.forEach(
        (checkbox) => {
          checkbox.checked = false;
        },
      );

      selected = [];

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

/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let config = {};
let lastHistoryId = null;
let lastGeneratedPayload = null;

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

  if (!pendingName) {
    return toast("Enter your name");
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
          }),
        },
      );

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
   GENERATE PROMPT
========================================================= */

if ($("generateBtn")) {
  $("generateBtn").onclick =
    async () => {
      const button =
        $("generateBtn");

      const subject =
        $("subject")
          ?.value.trim() || "";

      if (!subject) {
        $("subject")?.focus();

        return toast(
          "Enter a subject or scene first.",
        );
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
      const text =
        $("output")
          ?.textContent.trim() || "";

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
      const prompt =
        $("output")
          ?.textContent.trim() || "";

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
                      "/library.html";
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

const mediaState = {
  type: "image",
  kind: null,
  file: null,
  url: null,
  downloadUrl: null,
  sourceImageFile: null,
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
  return $("output")?.textContent.trim() || "";
}

function mediaRenderPreview({ kind, url }) {
  const holder = $("mediaPreview");

  if (!holder) return;

  holder.innerHTML = "";

  if (kind === "video") {
    const video = document.createElement("video");

    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;

    holder.appendChild(video);
  } else {
    const image = document.createElement("img");

    image.src = url;
    image.alt = "AI generated image";

    holder.appendChild(image);
  }
}

function mediaShowResult({ kind, file, url, downloadUrl }) {
  mediaStopProgress();

  mediaState.kind = kind;
  mediaState.file = file;
  mediaState.url = url;
  mediaState.downloadUrl = downloadUrl;

  if (kind === "image") {
    mediaState.sourceImageFile = file;
  }

  mediaRenderPreview({ kind, url });

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

  toast(message || "Media generation failed");

  mediaShowStep("type");
}

/* ---------- IMAGE ---------- */

async function mediaGenerateImage() {
  const prompt = mediaCurrentPrompt();

  mediaState.cancelled = false;

  mediaShowStep("loading");

  mediaStartProgress(35, "Generating image…");

  try {
    const data = await apiRequest("/api/media/image", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        prompt,

        ratio: $("ratio")?.value || "",
      }),
    });

    if (mediaState.cancelled) return;

    mediaSetProgress(100, "Done");

    mediaShowResult({
      kind: "image",
      file: data.file,
      url: data.url,
      downloadUrl: data.downloadUrl,
    });

    toast("Image generated ✨");
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

        mediaSetProgress(100, "Done");

        mediaShowResult({
          kind: "video",
          file: data.file,
          url: data.url,
          downloadUrl: data.downloadUrl,
        });

        toast("Video generated 🎬");

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

        duration: $("duration")?.value || "",

        imageFile: fromImage ? mediaState.sourceImageFile : null,
      }),
    });

    if (mediaState.cancelled) return;

    mediaState.jobId = data.jobId;

    mediaSetProgress(6, "Rendering video… this usually takes 1–3 minutes");

    await mediaPollVideo(data.jobId);
  } catch (error) {
    console.error("Video generation error:", error);

    if (!mediaState.cancelled) mediaFail(error.message);
  }
}

/* ---------- CONTROLS ---------- */

if ($("generateMediaBtn")) {
  $("generateMediaBtn").onclick = () => {
    const prompt = mediaCurrentPrompt();

    if (isPlaceholderPrompt(prompt)) {
      return toast("Generate a prompt first");
    }

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

document.querySelectorAll(".mediatype").forEach((button) => {
  button.onclick = () => {
    document
      .querySelectorAll(".mediatype")
      .forEach((item) => item.classList.remove("active"));

    button.classList.add("active");

    mediaState.type = button.dataset.type || "image";

    mediaUpdateGenerateLabel();
  };
});

if ($("mediaGenerateBtn")) {
  $("mediaGenerateBtn").onclick = () => {
    if (isPlaceholderPrompt(mediaCurrentPrompt())) {
      return toast("Generate a prompt first");
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
    if (!mediaState.sourceImageFile) {
      return toast("Generate an image first");
    }

    $("mediaAnimateBtn").disabled = true;

    mediaGenerateVideo({ fromImage: true });
  };
}

if ($("mediaRegenerateBtn")) {
  $("mediaRegenerateBtn").onclick = () => {
    if (mediaState.kind === "video") {
      mediaGenerateVideo({
        fromImage: Boolean(mediaState.sourceImageFile),
      });
    } else {
      mediaGenerateImage();
    }
  };
}

if ($("mediaBackBtn")) {
  $("mediaBackBtn").onclick = () => {
    mediaShowStep("type");

    mediaUpdateGenerateLabel();
  };
}

if ($("mediaCancelBtn")) {
  $("mediaCancelBtn").onclick = () => {
    mediaState.cancelled = true;
    mediaState.polling = false;

    mediaStopProgress();

    mediaShowStep("type");

    toast("Cancelled");
  };
}
