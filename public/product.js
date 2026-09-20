const $ = (id) => document.getElementById(id);

const toast = $("toast");

const showToast = (message) => {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
};

/* =========================================================
   GLOBAL STATE
========================================================= */

let user = null;
let config = {};

const PRODUCT_ID = "cinematic";

/* =========================================================
   SAFE JSON FETCH
========================================================= */

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`,
    );
  }

  return data;
}

/* =========================================================
   USER
========================================================= */

async function refreshUser() {
  try {
    const data = await fetchJSON("/api/me");

    user = data.user || null;

    $("loginBtn").classList.toggle("hide", !!user);

    $("logoutBtn").classList.toggle("hide", !user);

    return user;
  } catch (error) {
    user = null;

    $("loginBtn").classList.remove("hide");
    $("logoutBtn").classList.add("hide");

    console.error("User refresh failed:", error);

    return null;
  }
}

/* =========================================================
   INITIALIZATION
========================================================= */

(async () => {
  try {
    config = await fetchJSON("/api/config");

    const checkoutStatus = config.razorpayKeyId
      ? "Razorpay configured"
      : "Add Razorpay test keys to .env";

    $("integrationStatus").textContent =
      `Secure checkout • ${checkoutStatus} • Login required`;

    await refreshUser();
  } catch (error) {
    console.error(error);

    $("integrationStatus").textContent = "Server connection unavailable";
  }
})();

/* =========================================================
   LOGIN MODAL
========================================================= */

function openLoginModal() {
  $("loginModal").classList.add("show");

  $("loginStep1").classList.remove("hide");
  $("loginStep2").classList.add("hide");

  setTimeout(() => {
    $("name").focus();
  }, 100);
}

function closeLoginModal() {
  $("loginModal").classList.remove("show");
}

$("loginBtn").onclick = openLoginModal;

$("closeLogin").onclick = closeLoginModal;

/* Close modal when clicking outside */

$("loginModal").addEventListener("click", (event) => {
  if (event.target === $("loginModal")) {
    closeLoginModal();
  }
});

/* ESC closes modal */

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("loginModal").classList.contains("show")) {
    closeLoginModal();
  }
});

/* =========================================================
   OTP LOGIN
========================================================= */

let pendingEmail = "";
let pendingName = "";

/* SEND OTP */

$("sendOtpBtn").onclick = async () => {
  pendingName = $("name").value.trim();
  pendingEmail = $("email").value.trim();

  if (!pendingName) {
    return showToast("Enter your name");
  }

  if (!pendingEmail) {
    return showToast("Enter your email");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(pendingEmail)) {
    return showToast("Enter a valid email address");
  }

  const button = $("sendOtpBtn");

  button.disabled = true;
  button.textContent = "Sending…";

  try {
    const data = await fetchJSON("/api/auth/request-otp", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name: pendingName,
        email: pendingEmail,
      }),
    });

    $("loginStep1").classList.add("hide");
    $("loginStep2").classList.remove("hide");

    if (data.devOtp) {
      $("otpHint").textContent =
        `Dev mode — your code is ${data.devOtp} (SMTP not configured)`;
    } else {
      $("otpHint").textContent = `Code sent to ${pendingEmail}`;
    }

    showToast(data.message || "Code sent");

    setTimeout(() => {
      $("otp").focus();
    }, 100);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Send Code";
  }
};

/* RESEND OTP */

$("resendOtpBtn").onclick = () => {
  $("sendOtpBtn").onclick();
};

/* VERIFY OTP */

$("verifyOtpBtn").onclick = async () => {
  const otp = $("otp").value.trim();

  if (!pendingEmail) {
    return showToast("Please request a new code");
  }

  if (!/^\d{6}$/.test(otp)) {
    return showToast("Enter the 6-digit code");
  }

  const button = $("verifyOtpBtn");

  button.disabled = true;
  button.textContent = "Verifying…";

  try {
    await fetchJSON("/api/auth/verify-otp", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email: pendingEmail,
        otp,
      }),
    });

    closeLoginModal();

    await refreshUser();

    showToast("Logged in — checkout ready ✓");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Verify & Login";
  }
};

/* =========================================================
   LOGOUT
========================================================= */

$("logoutBtn").onclick = async () => {
  const button = $("logoutBtn");

  button.disabled = true;

  try {
    await fetchJSON("/api/auth/logout", {
      method: "POST",
    });

    user = null;

    await refreshUser();

    showToast("Logged out");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
};

/* =========================================================
   COPY SAMPLE PROMPTS
========================================================= */

document.querySelectorAll(".copy").forEach((button) => {
  button.onclick = async () => {
    const paragraph = button.parentElement.querySelector("p");

    if (!paragraph) {
      return showToast("Nothing to copy");
    }

    const text = paragraph.innerText.trim();

    if (!text) {
      return showToast("Nothing to copy");
    }

    try {
      await navigator.clipboard.writeText(text);

      showToast("Sample copied ✓");
    } catch (error) {
      console.error(error);

      showToast("Could not copy sample");
    }
  };
});

/* =========================================================
   OPEN LOGIN BEFORE CHECKOUT
========================================================= */

function requireLoginForCheckout() {
  if (user) {
    return true;
  }

  openLoginModal();

  showToast("Login before checkout");

  return false;
}

/* =========================================================
   DISABLE BUY BUTTONS DURING CHECKOUT
========================================================= */

function setBuyButtonsLoading(loading, activeButton = null) {
  document.querySelectorAll("[data-buy]").forEach((button) => {
    button.disabled = loading;

    if (loading) {
      button.dataset.originalText = button.textContent;

      button.textContent =
        button === activeButton ? "Processing…" : "Please wait…";
    } else {
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;

        delete button.dataset.originalText;
      }
    }
  });
}

/* =========================================================
   RAZORPAY CHECKOUT
========================================================= */

async function startCheckout(clickedButton) {
  if (!requireLoginForCheckout()) {
    return;
  }

  if (!config.razorpayKeyId) {
    showToast("Razorpay is not configured");

    return;
  }

  if (!window.Razorpay) {
    showToast("Razorpay Checkout could not load");

    return;
  }

  setBuyButtonsLoading(true, clickedButton);

  try {
    /* -----------------------------------------
       CREATE ORDER
    ----------------------------------------- */

    const order = await fetchJSON("/api/create-order", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        productId: PRODUCT_ID,
      }),
    });

    /* -----------------------------------------
       VALIDATE ORDER RESPONSE
    ----------------------------------------- */

    if (!order.keyId) {
      throw new Error("Razorpay key is missing");
    }

    if (!order.orderId) {
      throw new Error("Razorpay order ID is missing");
    }

    if (!order.amount) {
      throw new Error("Invalid payment amount");
    }

    /* -----------------------------------------
       RAZORPAY OPTIONS
    ----------------------------------------- */

    const options = {
      key: order.keyId,

      amount: order.amount,

      currency: order.currency || "INR",

      name: "EditPrompt.in",

      description: order.productName || "Cinematic AI Prompt Pack",

      order_id: order.orderId,

      prefill: {
        name: user?.name || pendingName || "",
        email: user?.email || pendingEmail || "",
      },

      theme: {
        color: "#E52329",
      },

      /* ---------------------------------------
         PAYMENT SUCCESS
      --------------------------------------- */

      handler: async (response) => {
        try {
          showToast("Verifying payment…");

          const verification = await fetchJSON("/api/verify-payment", {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              ...response,

              productId: PRODUCT_ID,
            }),
          });

          if (!verification.verified) {
            throw new Error(
              verification.error || "Payment verification failed",
            );
          }

          /* -------------------------------
             VERIFIED
          -------------------------------- */

          showToast("Payment verified ✓");

          $("integrationStatus").textContent =
            "Payment verified • Opening My Library…";

          setTimeout(() => {
            window.location.href = "/library.html";
          }, 900);
        } catch (error) {
          console.error("Payment verification error:", error);

          showToast(error.message || "Payment verification failed");

          setBuyButtonsLoading(false, clickedButton);
        }
      },

      /* ---------------------------------------
         PAYMENT MODAL CLOSE
      --------------------------------------- */

      modal: {
        ondismiss: () => {
          setBuyButtonsLoading(false, clickedButton);

          showToast("Checkout closed");
        },
      },
    };

    /* -----------------------------------------
       OPEN RAZORPAY
    ----------------------------------------- */

    const razorpay = new Razorpay(options);

    razorpay.on("payment.failed", (response) => {
      console.error("Razorpay payment failed:", response);

      setBuyButtonsLoading(false, clickedButton);

      const reason = response?.error?.description || "Payment failed";

      showToast(reason);
    });

    razorpay.open();
  } catch (error) {
    console.error("Checkout error:", error);

    showToast(error.message || "Could not start checkout");

    setBuyButtonsLoading(false, clickedButton);
  }
}

/* =========================================================
   BUY BUTTONS
========================================================= */

document.querySelectorAll("[data-buy]").forEach((button) => {
  button.onclick = () => {
    startCheckout(button);
  };
});

/* =========================================================
   KEYBOARD SUPPORT FOR OTP
========================================================= */

$("otp").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    $("verifyOtpBtn").click();
  }
});

/* =========================================================
   AUTO-FORMAT OTP
========================================================= */

$("otp").addEventListener("input", () => {
  $("otp").value = $("otp").value.replace(/\D/g, "").slice(0, 6);
});
