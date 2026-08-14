import React, { useEffect } from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = "CONFIRM ACTION",
  message,
  confirmText = "PROCEED",
  cancelText = "CANCEL",
  isDanger = false,
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box confirm-box" onClick={e => e.stopPropagation()}>
        <div className={`modal-header ${isDanger ? "danger-header" : ""}`}>
          <span>⚠️ {title.toUpperCase()}</span>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body confirm-body">
          <p className="confirm-prompt-text">{message}</p>

          <div className="confirm-button-row">
            <button
              className={`retro-btn ${isDanger ? "danger" : ""}`}
              onClick={onConfirm}
              autoFocus
            >
              ▶ {confirmText.toUpperCase()}
            </button>
            <button className="retro-btn" onClick={onCancel}>
              ✕ {cancelText.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
