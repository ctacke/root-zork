import React from "react";

interface StatusBarProps {
  location: string;
  score: number;
  moves: number;
  gameTitle: string;
  statusType?: string;
  isGameView: boolean;
  onOpenMenu: () => void;
  onOpenSaveModal: () => void;
  onOpenLeaderboard: () => void;
  onOpenHelpModal: () => void;
  onClearTerminal: () => void;
  scanlinesEnabled: boolean;
  onToggleScanlines: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  location,
  score,
  moves,
  gameTitle,
  statusType = "score",
  isGameView,
  onOpenMenu,
  onOpenSaveModal,
  onOpenLeaderboard,
  onOpenHelpModal,
  onClearTerminal,
  scanlinesEnabled,
  onToggleScanlines
}) => {
  const isTime = statusType === "time";

  return (
    <div className="terminal-status-bar">
      <div className="status-left">
        {isGameView ? (
          <>
            <div className="status-item">
              <span className="status-label">LOCATION:</span>
              <span className="status-value">{location || "WEST OF HOUSE"}</span>
            </div>
            <div className="status-item">
              <span className="status-label">{isTime ? "TIME:" : "SCORE:"}</span>
              <span className="status-value">{score}</span>
            </div>
            <div className="status-item">
              <span className="status-label">{isTime ? "MINUTES:" : "MOVES:"}</span>
              <span className="status-value">{moves}</span>
            </div>
          </>
        ) : (
          <div className="status-item">
            <span className="status-value">⚔ ZORK TRILOGY CONSOLE</span>
          </div>
        )}
      </div>

      <div className="status-right">
        {isGameView && (
          <span className="status-badge">{gameTitle || "ZORK I"}</span>
        )}
        
        {isGameView && (
          <button
            className="status-action-btn"
            onClick={onOpenMenu}
            title="Return to Game Selection Menu"
          >
            MENU
          </button>
        )}
        
        <button
          className="status-action-btn"
          onClick={onOpenLeaderboard}
          title="Top 20 Leaderboard"
        >
          🏆 TOP 20
        </button>

        <button
          className="status-action-btn"
          onClick={onOpenSaveModal}
          title="Save or Restore Game Slots"
        >
          SAVES
        </button>

        <button
          className="status-action-btn"
          onClick={onOpenHelpModal}
          title="Adventurer's Guide"
        >
          GUIDE
        </button>

        {isGameView && (
          <button
            className="status-action-btn"
            onClick={onClearTerminal}
            title="Clear Terminal Output"
          >
            CLEAR
          </button>
        )}

        <button
          className="status-action-btn"
          onClick={onToggleScanlines}
          title="Toggle CRT Scanline Effect"
        >
          CRT:{scanlinesEnabled ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
};
