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
 *   checked, then sends the person to the application page.
 */

(function () {
  "use strict";

  const SESSION_SEEN_KEY = "joyshop_ambassador_popup_seen";

  /*
   * Update this to match the handle of the Page you create in
   * Shopify Admin → Online Store → Pages, using the
   * "ambassador-application" template.
   */
  const APPLICATION_PAGE_URL = "/pages/become-an-ambassador";

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
      commissionText: document.getElementById(
        "joyshop-popup-commission-text"
      ),
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

  function updateCommissionText(elements, rate) {
    if (!elements.commissionText || !rate) return;

    elements.commissionText.textContent = `Earn up to ${rate}% Commission`;
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
      stepTwo.ctaBtn.addEventListener("click", function () {
        if (stepTwo.ctaBtn.disabled) return;

        window.location.href = APPLICATION_PAGE_URL;
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

    if (data.commissionRate) {
      updateCommissionText(stepOne, data.commissionRate);
    }

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
