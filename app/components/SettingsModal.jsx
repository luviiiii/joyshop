import { useEffect } from "react";
import { createPortal } from "react-dom";

const KYC_LABELS = {
  APPROVED: { text: "Verified", tone: "good" },
  PENDING: { text: "Under review", tone: "warn" },
  REJECTED: { text: "Needs resubmission", tone: "bad" },
  NOT_SUBMITTED: { text: "Not submitted", tone: "warn" },
};

export default function SettingsModal({
  open,
  onClose,
  ambassador,
  referralLink,
  copied,
  onCopy,
  kycStatus = "NOT_SUBMITTED",
  darkMode = false,
  onToggleDarkMode,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const name = ambassador?.name || "Ambassador";
  const email = ambassador?.email || "Not available";
  const code = ambassador?.referralCode || "-";
  const isActive = (ambassador?.status || "ACTIVE") === "ACTIVE";
  const kyc = KYC_LABELS[kycStatus] || KYC_LABELS.NOT_SUBMITTED;

  const initials =
    name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AM";

  // Rendered into <body> so no parent layout or stacking context can hide it
  return createPortal(
    <div
      className="jo-settings-overlay"
      data-theme={darkMode ? "dark" : "light"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="jo-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jo-settings-title"
      >
        {/* Header */}
        <div className="jo-settings-header">
          <div>
            <div id="jo-settings-title" className="jo-settings-title">
              Settings
            </div>
            <div className="jo-settings-subtitle">
              Your ambassador account
            </div>
          </div>

          <button
            type="button"
            className="jo-settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="jo-settings-body">
          {/* Profile card */}
          <div className="jo-profile">
            <div className="jo-avatar">{initials}</div>
            <div className="jo-profile-text">
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
          </div>

          {/* Account details */}
          <div className="jo-section-title">Account</div>

          <div className="jo-rows">
            <div className="jo-row">
              <span className="jo-label">Referral code</span>
              <span className="jo-value jo-mono">{code}</span>
            </div>

            <div className="jo-row">
              <span className="jo-label">Account status</span>
              <span className={`jo-pill ${isActive ? "good" : "muted"}`}>
                <span className="jo-dot" />
                {isActive ? "Active" : ambassador?.status}
              </span>
            </div>

            <div className="jo-row">
              <span className="jo-label">KYC</span>
              <span className={`jo-pill ${kyc.tone}`}>
                <span className="jo-dot" />
                {kyc.text}
              </span>
            </div>
          </div>

          {kycStatus !== "APPROVED" && kycStatus !== "PENDING" && (
            <a
              className="jo-kyc-link"
              href="https://www.justorganik.com/pages/become-an-ambassador"
            >
              {kycStatus === "REJECTED" ? "Resubmit your KYC" : "Complete your KYC"} →
            </a>
          )}

          {/* Referral link */}
          <div className="jo-section-title">Referral link</div>

          <div className="jo-link-row">
            <input
              type="text"
              value={referralLink || ""}
              readOnly
              onFocus={(event) => event.target.select()}
              aria-label="Your referral link"
            />
            <button type="button" className="jo-btn-primary" onClick={onCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Appearance */}
          <div className="jo-section-title">Appearance</div>

          <div className="jo-pref">
            <div>
              <strong>Dark mode</strong>
              <small>Easier on the eyes at night</small>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={darkMode}
              aria-label="Dark mode"
              className={darkMode ? "jo-switch on" : "jo-switch"}
              onClick={onToggleDarkMode}
            >
              <span className="jo-switch-knob" />
            </button>
          </div>

          {/* Help */}
          <div className="jo-note">
            Need to change your name, email or bank details? Contact the Just
            Organik team and we'll update them for you.
          </div>
        </div>

        {/* Footer */}
        <div className="jo-settings-footer">
          <button
            type="button"
            className="jo-btn-logout"
            onClick={() => {
              window.location.href = "/pages/account";
            }}
          >
            Log out
          </button>

          <button type="button" className="jo-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <style>{modalStyles}</style>
    </div>,
    document.body
  );
}

const modalStyles = `
.jo-settings-overlay {
  --bg: #ffffff;
  --bg-soft: #f6faf7;
  --border: #e4ebe6;
  --text: #1f2d22;
  --muted: #6b7a70;
  --brand: #14532d;
  --brand-soft: #eaf3de;
  --input: #fbfcfb;

  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 22, 19, 0.5);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  animation: joFade .18s ease;
}

.jo-settings-overlay[data-theme="dark"] {
  --bg: #141d19;
  --bg-soft: #1a2620;
  --border: #22302a;
  --text: #e5efe8;
  --muted: #8fa398;
  --brand: #6fcf8f;
  --brand-soft: #1d2b24;
  --input: #0f1613;
}

.jo-settings-overlay *, .jo-settings-overlay *::before, .jo-settings-overlay *::after { box-sizing: border-box; }

@keyframes joFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes joRise { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }

.jo-settings {
  width: min(480px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25);
  animation: joRise .2s ease;
}

.jo-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border);
}

.jo-settings-title { font-size: 19px; font-weight: 800; color: var(--text); }
.jo-settings-subtitle { margin-top: 3px; font-size: 12.5px; color: var(--muted); }

.jo-settings-close {
  width: 34px; height: 34px; flex-shrink: 0;
  border: 0; border-radius: 50%;
  background: var(--bg-soft); color: var(--muted);
  font-size: 22px; line-height: 1; cursor: pointer;
}
.jo-settings-close:hover { color: var(--brand); }

.jo-settings-body { overflow-y: auto; padding: 18px 22px 22px; }

.jo-profile {
  display: flex; align-items: center; gap: 12px;
  padding: 14px; border-radius: 12px; background: var(--bg-soft);
}
.jo-avatar {
  width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%;
  background: var(--brand-soft); color: var(--brand);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 15px;
}
.jo-profile-text { min-width: 0; }
.jo-profile-text strong { display: block; font-size: 15px; }
.jo-profile-text span { display: block; margin-top: 2px; font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }

.jo-section-title {
  margin: 20px 0 8px;
  font-size: 10.5px; font-weight: 800; letter-spacing: .6px;
  text-transform: uppercase; color: var(--brand);
}

.jo-rows { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.jo-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; border-bottom: 1px solid var(--border);
}
.jo-row:last-child { border-bottom: 0; }
.jo-label { font-size: 13px; color: var(--muted); }
.jo-value { font-size: 13px; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
.jo-mono { letter-spacing: .4px; }

.jo-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 700; white-space: nowrap;
}
.jo-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.jo-pill.good { background: #e5f7eb; color: #16803c; }
.jo-pill.warn { background: #fff4e0; color: #a86412; }
.jo-pill.bad { background: #fff0ef; color: #b42318; }
.jo-pill.muted { background: #f1f3f2; color: #68736d; }
.jo-settings-overlay[data-theme="dark"] .jo-pill.good { background: #16281c; color: #6fcf8f; }
.jo-settings-overlay[data-theme="dark"] .jo-pill.warn { background: #33241a; color: #e2a35f; }
.jo-settings-overlay[data-theme="dark"] .jo-pill.bad { background: #2a1a19; color: #ef7a6d; }
.jo-settings-overlay[data-theme="dark"] .jo-pill.muted { background: #26302b; color: #9db2a5; }

.jo-kyc-link {
  display: inline-block; margin-top: 10px;
  font-size: 13px; font-weight: 700; color: var(--brand); text-decoration: none;
}
.jo-kyc-link:hover { text-decoration: underline; }

.jo-link-row { display: flex; gap: 8px; }
.jo-link-row input {
  flex: 1; min-width: 0;
  border: 1px solid var(--border); border-radius: 9px;
  padding: 10px 12px; font: inherit; font-size: 12.5px;
  color: var(--muted); background: var(--input);
}

.jo-btn-primary {
  border: 0; border-radius: 9px;
  background: #14532d; color: #ffffff;
  padding: 10px 18px; font: inherit; font-size: 13px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
}
.jo-btn-primary:hover { background: #0d3b1f; }
.jo-settings-overlay[data-theme="dark"] .jo-btn-primary { background: #2f8f57; }
.jo-settings-overlay[data-theme="dark"] .jo-btn-primary:hover { background: #257a48; }

.jo-pref {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px;
}
.jo-pref strong { display: block; font-size: 13.5px; }
.jo-pref small { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }

.jo-switch {
  width: 44px; height: 26px; flex-shrink: 0;
  padding: 3px; border: 0; border-radius: 999px;
  background: #cbd5ce; cursor: pointer;
  transition: background .2s ease;
}
.jo-switch.on { background: #2f8f57; }
.jo-switch-knob {
  display: block; width: 20px; height: 20px; border-radius: 50%;
  background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,.2);
  transition: transform .2s ease;
}
.jo-switch.on .jo-switch-knob { transform: translateX(18px); }

.jo-note {
  margin-top: 18px; padding: 12px 14px; border-radius: 10px;
  background: var(--bg-soft); font-size: 12.5px; line-height: 1.5; color: var(--muted);
}

.jo-settings-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 22px; border-top: 1px solid var(--border); background: var(--bg-soft);
}

.jo-btn-logout {
  border: 1px solid #f1c9c9; border-radius: 9px;
  background: transparent; color: #b42318;
  padding: 10px 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
}
.jo-btn-logout:hover { background: #fff1f0; }
.jo-settings-overlay[data-theme="dark"] .jo-btn-logout { border-color: #3a201f; color: #ef7a6d; }
.jo-settings-overlay[data-theme="dark"] .jo-btn-logout:hover { background: #2a1a19; }

/* Phone: slides up from the bottom like a native sheet */
@media (max-width: 600px) {
  .jo-settings-overlay { align-items: flex-end; padding: 0; }
  .jo-settings {
    width: 100%;
    max-height: 90vh;
    border-radius: 18px 18px 0 0;
    border-bottom: 0;
  }
  .jo-settings-header { padding: 18px 18px 14px; }
  .jo-settings-body { padding: 16px 18px 20px; }
  .jo-settings-footer { padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)); }
}
`;
