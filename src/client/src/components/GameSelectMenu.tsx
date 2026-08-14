import React from "react";
import { GameInfo } from "@zork/gen-shared";

interface GameSelectMenuProps {
  games: GameInfo[];
  currentActiveGameId?: string;
  onSelectGame: (gameId: string, restart: boolean) => void;
  onOpenSaveSlots: (gameId?: string) => void;
  onOpenHelp: () => void;
  isExecuting: boolean;
  userNickname: string;
}

export const GameSelectMenu: React.FC<GameSelectMenuProps> = ({
  games,
  currentActiveGameId,
  onSelectGame,
  onOpenSaveSlots,
  onOpenHelp,
  isExecuting,
  userNickname
}) => {
  return (
    <div className="menu-view-container">
      {/* ASCII Retro Header */}
      <pre className="ascii-banner">
{`███████╗ ██████╗ ██████╗ ██╗  ██╗
╚══███╔╝██╔═══██╗██╔══██╗██║ ██╔╝
  ███╔╝ ██║   ██║██████╔╝█████╔╝ 
 ███╔╝  ██║   ██║██╔══██╗██╔═██╗ 
███████╗╚██████╔╝██║  ██║██║  ██╗
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝`}
      </pre>

      <div className="menu-subtitle">
        T H E &nbsp; T R I L O G Y &nbsp; C O N S O L E
      </div>

      <p style={{ color: "var(--phosphor-dim)", fontFamily: "var(--mono-code-font)", fontSize: "15px" }}>
        Welcome, {userNickname || "Adventurer"}. Select a tale to enter the Great Underground Empire:
      </p>

      {/* Game Cards List */}
      <div className="game-cards-grid">
        {games.map((game, index) => {
          const numKey = index + 1;
          const isLastActive = game.id === currentActiveGameId;

          return (
            <div
              key={game.id}
              className={`game-card ${isLastActive ? "selected" : ""}`}
              onClick={() => onSelectGame(game.id, false)}
            >
              <div className="game-card-header">
                <div className="game-card-title">{game.title}</div>
                <span className="game-card-key">PRESS [{numKey}]</span>
              </div>

              <div className="game-card-desc">{game.description}</div>

              {game.hasActiveGame ? (
                <div className="game-card-status">
                  <span>📍 Last Location: <strong>{game.lastLocation || "In Progress"}</strong></span>
                  <span>🏆 Score: <strong>{game.lastScore}</strong></span>
                  <span>👣 Moves: <strong>{game.lastMoves}</strong></span>
                </div>
              ) : (
                <div className="game-card-status" style={{ color: "var(--phosphor-dim)" }}>
                  <span>✨ No active save - Ready for a fresh quest</span>
                </div>
              )}

              <div className="game-card-actions" onClick={e => e.stopPropagation()}>
                {game.hasActiveGame ? (
                  <>
                    <button
                      className="retro-btn"
                      onClick={() => onSelectGame(game.id, false)}
                      disabled={isExecuting}
                    >
                      ▶ RESUME QUEST
                    </button>
                    <button
                      className="retro-btn danger"
                      onClick={() => {
                        if (confirm(`Start a fresh game of ${game.title}? Existing autosave will be replaced.`)) {
                          onSelectGame(game.id, true);
                        }
                      }}
                      disabled={isExecuting}
                    >
                      ↺ START OVER
                    </button>
                  </>
                ) : (
                  <button
                    className="retro-btn"
                    onClick={() => onSelectGame(game.id, true)}
                    disabled={isExecuting}
                  >
                    ▶ START NEW GAME
                  </button>
                )}

                <button
                  className="retro-btn"
                  onClick={() => onOpenSaveSlots(game.id)}
                >
                  💾 SAVED SLOTS
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Menu Hotkeys info */}
      <div style={{ marginTop: "12px", display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        <button className="retro-btn" onClick={onOpenHelp}>
          ❓ ADVENTURER'S GUIDE
        </button>
        <button className="retro-btn" onClick={() => onOpenSaveSlots()}>
          📁 ALL SAVE SLOTS
        </button>
      </div>
    </div>
  );
};
