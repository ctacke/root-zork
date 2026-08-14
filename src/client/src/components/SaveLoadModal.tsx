import React, { useState } from "react";
import { SaveSlotInfo } from "@zork/gen-shared";

interface SaveLoadModalProps {
  isOpen: boolean;
  gameId: string;
  gameTitle: string;
  currentLocation: string;
  currentScore: number;
  currentMoves: number;
  slots: SaveSlotInfo[];
  onClose: () => void;
  onSaveSlot: (slotName: string, description: string) => Promise<void>;
  onRestoreSlot: (slotId: string, gameId: string) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  isOpen,
  gameId,
  gameTitle,
  currentLocation,
  currentScore,
  currentMoves,
  slots,
  onClose,
  onSaveSlot,
  onRestoreSlot,
  onDeleteSlot
}) => {
  const [newSlotName, setNewSlotName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  if (!isOpen) return null;

  const handleCreateSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSlotName.trim() || `Save @ ${currentLocation || "Room"}`;
    setIsSaving(true);
    try {
      await onSaveSlot(name, `Location: ${currentLocation} (Score: ${currentScore}, Moves: ${currentMoves})`);
      setNewSlotName("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async (slot: SaveSlotInfo) => {
    if (confirm(`Restore progress from "${slot.slotName}"? Any unsaved progress will be replaced.`)) {
      setIsRestoring(true);
      try {
        await onRestoreSlot(slot.id, slot.gameId || gameId);
        onClose();
      } finally {
        setIsRestoring(false);
      }
    }
  };

  const handleDelete = async (slotId: string) => {
    if (confirm("Delete this save slot?")) {
      await onDeleteSlot(slotId);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>💾 SAVE & RESTORE MANAGER [{gameTitle.toUpperCase()}]</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Create New Save Slot */}
          <form onSubmit={handleCreateSave} className="save-input-group">
            <input
              type="text"
              className="retro-text-input"
              value={newSlotName}
              onChange={e => setNewSlotName(e.target.value)}
              placeholder={`Slot Name (e.g. 'Before Troll Room', 'Cellar')...`}
              disabled={isSaving}
            />
            <button type="submit" className="retro-btn" disabled={isSaving}>
              {isSaving ? "SAVING..." : "+ SAVE CURRENT GAME"}
            </button>
          </form>

          {/* List of Saved Slots */}
          <div style={{ borderTop: "1px dashed var(--border-green)", paddingTop: "12px" }}>
            <h4 style={{ color: "var(--phosphor-bright)", marginBottom: "10px", fontSize: "16px" }}>
              EXISTING SAVE SLOTS ({slots.length})
            </h4>

            {slots.length === 0 ? (
              <div style={{ color: "var(--phosphor-dim)", fontStyle: "italic", padding: "12px 0" }}>
                No named save slots yet. Your game is also automatically saved after every move.
              </div>
            ) : (
              <div className="slots-list">
                {slots.map(slot => (
                  <div key={slot.id} className="slot-item">
                    <div className="slot-details">
                      <div className="slot-title">{slot.slotName}</div>
                      <div className="slot-meta">
                        <span>📍 {slot.location}</span> &bull; <span>Score: {slot.score}</span> &bull; <span>Moves: {slot.moves}</span>
                      </div>
                      <div className="slot-meta" style={{ opacity: 0.7 }}>
                        {new Date(slot.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="slot-actions">
                      <button
                        className="retro-btn"
                        onClick={() => handleRestore(slot)}
                        disabled={isRestoring}
                      >
                        RESTORE
                      </button>
                      <button
                        className="retro-btn danger"
                        onClick={() => handleDelete(slot.id)}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
