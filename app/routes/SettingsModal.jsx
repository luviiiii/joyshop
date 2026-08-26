import { useEffect } from "react";

export default function SettingsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="settings-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="settings-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div>
            <div className="settings-modal-title">
              ⚙️ Settings
            </div>

            <div className="settings-modal-subtitle">
              Manage your ambassador account
            </div>
          </div>

          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-section">
            <div className="settings-section-title">
              Profile
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">
                  Ambassador Name
                </div>

                <div className="settings-value">
                  Karine Ruby
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">
                  Ambassador ID
                </div>

                <div className="settings-value">
                  KARINERU-57WS06
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">
                  Account Status
                </div>

                <div className="settings-status">
                  <span className="settings-status-dot"></span>
                  Active
                </div>
              </div>
            </div>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-section">
            <div className="settings-section-title">
              Account
            </div>

            <button
              type="button"
              className="settings-option"
              onClick={() => {
                alert("Profile settings coming soon.");
              }}
            >
              <span className="settings-option-icon">
                👤
              </span>

              <span>
                <strong>Edit Profile</strong>
                <small>
                  Update your ambassador information
                </small>
              </span>

              <span className="settings-arrow">
                ›
              </span>
            </button>

            <button
              type="button"
              className="settings-option"
              onClick={() => {
                alert("Password settings coming soon.");
              }}
            >
              <span className="settings-option-icon">
                🔒
              </span>

              <span>
                <strong>Password & Security</strong>
                <small>
                  Manage your account security
                </small>
              </span>

              <span className="settings-arrow">
                ›
              </span>
            </button>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-section">
            <div className="settings-section-title">
              Preferences
            </div>

            <div className="settings-preference">
              <div>
                <strong>Email Notifications</strong>
                <small>
                  Receive updates about referrals and commissions
                </small>
              </div>

              <div className="settings-toggle active">
                <div className="settings-toggle-knob"></div>
              </div>
            </div>

            <div className="settings-preference">
              <div>
                <strong>Commission Updates</strong>
                <small>
                  Get notified when commission status changes
                </small>
              </div>

              <div className="settings-toggle active">
                <div className="settings-toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-modal-footer">
          <button
            type="button"
            className="settings-cancel-button"
            onClick={onClose}
          >
            Close
          </button>

          <button
            type="button"
            className="settings-save-button"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        .settings-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(20, 35, 25, 0.42);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .settings-modal {
          width: min(560px, 100%);
          max-height: calc(100vh - 48px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border: 1px solid #d8e8dd;
          border-radius: 18px;
          box-shadow: 0 24px 70px rgba(0, 70, 35, 0.22);
          color: #183126;
          font-family: Georgia, "Times New Roman", serif;
        }

        .settings-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 24px 26px 20px;
          border-bottom: 1px solid #e8eee9;
        }

        .settings-modal-title {
          color: #087d3d;
          font-size: 24px;
          font-weight: 700;
        }

        .settings-modal-subtitle {
          margin-top: 5px;
          color: #758078;
          font-size: 13px;
        }

        .settings-modal-close {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 50%;
          background: #f2f7f3;
          color: #42604e;
          font-size: 25px;
          line-height: 1;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .settings-modal-close:hover {
          background: #e3f2e7;
          color: #087d3d;
        }

        .settings-modal-body {
          overflow-y: auto;
          padding: 22px 26px;
        }

        .settings-section-title {
          margin-bottom: 12px;
          color: #087d3d;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .settings-row {
          padding: 13px 0;
        }

        .settings-label {
          margin-bottom: 4px;
          color: #7a837d;
          font-size: 12px;
        }

        .settings-value {
          color: #183126;
          font-size: 16px;
          font-weight: 600;
        }

        .settings-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-top: 3px;
          padding: 5px 10px;
          border-radius: 999px;
          background: #e4f7ea;
          color: #087d3d;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 12px;
          font-weight: 700;
        }

        .settings-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #16a34a;
        }

        .settings-divider {
          height: 1px;
          margin: 18px 0;
          background: #e8eee9;
        }

        .settings-option {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px 12px;
          margin-bottom: 7px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #183126;
          text-align: left;
          cursor: pointer;
          font-family: Georgia, "Times New Roman", serif;
          transition: 0.2s ease;
        }

        .settings-option:hover {
          background: #f1f8f3;
        }

        .settings-option-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #e6f5ea;
          font-size: 17px;
        }

        .settings-option strong,
        .settings-option small {
          display: block;
        }

        .settings-option strong {
          font-size: 14px;
        }

        .settings-option small {
          margin-top: 3px;
          color: #7c857f;
          font-size: 12px;
        }

        .settings-arrow {
          margin-left: auto;
          color: #087d3d;
          font-size: 24px;
        }

        .settings-preference {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 0;
        }

        .settings-preference strong,
        .settings-preference small {
          display: block;
        }

        .settings-preference strong {
          font-size: 14px;
        }

        .settings-preference small {
          margin-top: 4px;
          color: #7c857f;
          font-size: 12px;
        }

        .settings-toggle {
          width: 42px;
          height: 24px;
          flex: 0 0 42px;
          padding: 3px;
          border-radius: 999px;
          background: #cbd5ce;
        }

        .settings-toggle.active {
          background: #087d3d;
        }

        .settings-toggle-knob {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.18);
          transform: translateX(0);
        }

        .settings-toggle.active .settings-toggle-knob {
          transform: translateX(18px);
        }

        .settings-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 17px 26px;
          border-top: 1px solid #e8eee9;
          background: #fbfdfb;
        }

        .settings-cancel-button,
        .settings-save-button {
          padding: 10px 19px;
          border-radius: 8px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .settings-cancel-button {
          border: 1px solid #d5e1d8;
          background: #ffffff;
          color: #355044;
        }

        .settings-save-button {
          border: 1px solid #087d3d;
          background: #087d3d;
          color: #ffffff;
        }

        .settings-save-button:hover {
          background: #066c34;
        }

        @media (max-width: 600px) {
          .settings-modal-overlay {
            padding: 12px;
          }

          .settings-modal {
            max-height: calc(100vh - 24px);
            border-radius: 14px;
          }

          .settings-modal-header,
          .settings-modal-body,
          .settings-modal-footer {
            padding-left: 18px;
            padding-right: 18px;
          }
        }
      `}</style>
    </div>
  );
}