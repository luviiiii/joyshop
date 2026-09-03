/*
 * JOYSHOP Ambassador Popup
 *
 * - Calls the JOYSHOP app proxy to check eligibility server-side.
 * - Never trusts browser-supplied spend amounts.
 * - No Admin API tokens or database credentials ever touch this file.
 * - Shows the eligibility popup once per eligible customer.
 * - "Know More" opens a second popup with benefits + terms.
 * - The terms checkbox stays disabled until the person scrolls
 *   the terms box to the bottom.
 * - "I'm Interested" stays disabled until the checkbox is
 *   checked, then sends the customer an email with a link to
 *   the application page.
 */

(function () {
  "use strict";

  const SESSION_SEEN_KEY = "joyshop_ambassador_popup_seen";

  /*
   * How close to the bottom (in px) counts as "scrolled to
   * the end" for the terms box.
   */
  const SCROLL_THRESHOLD_PX = 8;

  function getStepOneElements() {
    return {
      overlay: document.getElementById("joyshop-ambassador-popup"),
      closeBtn: document.getElementById("joyshop-popup-close"),
      knowMoreBtn: document.getElementById("joyshop-popup-know-more-btn"),
      laterBtn: document.getElementById("joyshop-popup-later-btn"),
    };
  }

  function getStepTwoElements() {
    return {
      overlay: document.getElementById("joyshop-terms-popup"),
      closeBtn: document.getElementById("joyshop-terms-close"),
      backBtn: document.getElementById("joyshop-terms-back"),
      termsBox: document.getElementById("joyshop-terms-box"),
      checkbox: document.getElementById("joyshop-terms-checkbox"),
      ctaBtn: document.getElementById("joyshop-terms-cta"),
      message: document.getElementById("joyshop-terms-message"),
    };
  }

  function showOverlay(overlay) {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hideOverlay(overlay) {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function checkEligibility() {
    try {
      const response = await fetch("/apps/joyshop/eligibility", {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("JOYSHOP eligibility check failed:", error);
      return null;
    }
  }

  async function notifyInterest() {
    try {
      const response = await fetch("/apps/joyshop/notify-interest", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      return await response.json();
    } catch (error) {
      console.error("JOYSHOP notify-interest failed:", error);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
      };
    }
  }

  function setMessage(elements, text, isError) {
    if (!elements.message) return;

    elements.message.textContent = text || "";
    elements.message.className = isError
      ? "joyshop-terms-message joyshop-terms-error"
      : "joyshop-terms-message joyshop-terms-success";
  }

  function setupTermsScrollGate(stepTwo) {
    if (!stepTwo.termsBox || !stepTwo.checkbox) return;

    function checkScrollPosition() {
      const box = stepTwo.termsBox;

      const scrolledToBottom =
        box.scrollTop + box.clientHeight >=
        box.scrollHeight - SCROLL_THRESHOLD_PX;

      if (scrolledToBottom) {
        stepTwo.checkbox.disabled = false;
      }
    }

    /*
     * If the terms content is short enough that there's
     * nothing to scroll, unlock immediately.
     */
    if (stepTwo.termsBox.scrollHeight <= stepTwo.termsBox.clientHeight) {
      stepTwo.checkbox.disabled = false;
    }

    stepTwo.termsBox.addEventListener("scroll", checkScrollPosition);
  }

  function setupCheckboxGate(stepTwo) {
    if (!stepTwo.checkbox || !stepTwo.ctaBtn) return;

    stepTwo.checkbox.addEventListener("change", function () {
      stepTwo.ctaBtn.disabled = !stepTwo.checkbox.checked;
    });
  }

  async function init() {
    const stepOne = getStepOneElements();
    const stepTwo = getStepTwoElements();

    if (!stepOne.overlay) {
      return;
    }

    setupTermsScrollGate(stepTwo);
    setupCheckboxGate(stepTwo);

    if (stepTwo.closeBtn) {
      stepTwo.closeBtn.addEventListener("click", function () {
        hideOverlay(stepTwo.overlay);
      });
    }

    if (stepTwo.backBtn) {
      stepTwo.backBtn.addEventListener("click", function () {
        hideOverlay(stepTwo.overlay);
        showOverlay(stepOne.overlay);
      });
    }

    if (stepTwo.overlay) {
      stepTwo.overlay.addEventListener("click", function (event) {
        if (event.target === stepTwo.overlay) {
          hideOverlay(stepTwo.overlay);
        }
      });
    }

    if (stepTwo.ctaBtn) {
      stepTwo.ctaBtn.addEventListener("click", async function () {
        if (stepTwo.ctaBtn.disabled) return;

        const originalText = stepTwo.ctaBtn.innerHTML;

        stepTwo.ctaBtn.disabled = true;
        stepTwo.ctaBtn.textContent = "Sending...";

        const result = await notifyInterest();

        if (result.success) {
          setMessage(
            stepTwo,
            `We've sent an application link to ${result.email}. Please check your inbox!`,
            false
          );

          stepTwo.ctaBtn.textContent = "Email Sent!";
        } else {
          setMessage(
            stepTwo,
            result.error || "Something went wrong. Please try again.",
            true
          );

          stepTwo.ctaBtn.disabled = false;
          stepTwo.ctaBtn.innerHTML = originalText;
        }
      });
    }

    /*
     * Only ever attempt the eligibility check once per browser
     * session so we don't spam the endpoint on every page view.
     */

    if (sessionStorage.getItem(SESSION_SEEN_KEY) === "true") {
      return;
    }

    const data = await checkEligibility();

    if (!data || !data.eligible) {
      sessionStorage.setItem(SESSION_SEEN_KEY, "true");
      return;
    }

    sessionStorage.setItem(SESSION_SEEN_KEY, "true");

    showOverlay(stepOne.overlay);

    stepOne.closeBtn.addEventListener("click", function () {
      hideOverlay(stepOne.overlay);
    });

    stepOne.laterBtn.addEventListener("click", function () {
      hideOverlay(stepOne.overlay);
    });

    stepOne.overlay.addEventListener("click", function (event) {
      if (event.target === stepOne.overlay) {
        hideOverlay(stepOne.overlay);
      }
    });

    stepOne.knowMoreBtn.addEventListener("click", function () {
      hideOverlay(stepOne.overlay);

      if (stepTwo.overlay) {
        showOverlay(stepTwo.overlay);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
