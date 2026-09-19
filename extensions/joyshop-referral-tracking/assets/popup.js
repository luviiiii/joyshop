/*
 * JOYSHOP Ambassador Popup
 *
 * - Calls the JOYSHOP app proxy to check eligibility server-side.
 * - Never trusts browser-supplied spend amounts.
 * - No Admin API tokens or database credentials ever touch this file.
 * - Shows the eligibility popup once per eligible customer, automatically.
 * - Also exposes window.JoyshopAmbassadorPopup.open() so other
 *   pages (like the account page's "Become an Ambassador" button)
 *   can manually reopen the same two-step flow on demand.
 * - "Know More" opens a second popup with benefits + terms.
 * - The terms checkbox stays disabled until the person scrolls
 *   the terms box to the bottom.
 * - "I'm Interested" stays disabled until the checkbox is
 *   checked, then sends the customer an email with a link to
 *   the application page.
 */

(function () {
  "use strict";

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
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hideOverlay(overlay) {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function becomeAmbassador() {
    try {
      const response = await fetch("/apps/joyshop/become-ambassador", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      return await response.json();
    } catch (error) {
      console.error("JOYSHOP become-ambassador failed:", error);
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

    /*
     * Step 1 listeners are now always attached (not just when
     * the automatic eligibility-triggered popup shows), so that
     * a manual open via window.JoyshopAmbassadorPopup.open()
     * works correctly from any page, any time.
     */
    if (stepOne.closeBtn) {
      stepOne.closeBtn.addEventListener("click", function () {
        hideOverlay(stepOne.overlay);
      });
    }

    if (stepOne.laterBtn) {
      stepOne.laterBtn.addEventListener("click", function () {
        hideOverlay(stepOne.overlay);
      });
    }

    if (stepOne.overlay) {
      stepOne.overlay.addEventListener("click", function (event) {
        if (event.target === stepOne.overlay) {
          hideOverlay(stepOne.overlay);
        }
      });
    }

    if (stepOne.knowMoreBtn) {
      stepOne.knowMoreBtn.addEventListener("click", function () {
        hideOverlay(stepOne.overlay);

        if (stepTwo.overlay) {
          showOverlay(stepTwo.overlay);
        }
      });
    }

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
        stepTwo.ctaBtn.textContent = "Setting up your account...";

        const result = await becomeAmbassador();

        if (result.success) {
          if (result.alreadyAmbassador) {
            setMessage(
              stepTwo,
              `You're already an ambassador! Your referral code is ${result.referralCode}.`,
              false
            );
          } else {
            setMessage(
              stepTwo,
              `You're officially a Just Organik Ambassador! We've sent your referral link and code (${result.referralCode}) to your email — check your inbox.`,
              false
            );
          }

          stepTwo.ctaBtn.textContent = "You're an Ambassador!";
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
     * Expose a global manual-open function so other pages (the
     * account page's "Become an Ambassador" button) can open
     * this popup. This is now the ONLY way the popup ever
     * appears — there is no automatic on-load check anymore.
     * Someone who closes it or clicks "Maybe Later" simply
     * won't see it again unless they click that button.
     */
    window.JoyshopAmbassadorPopup = {
      open: function () {
        showOverlay(stepOne.overlay);
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
