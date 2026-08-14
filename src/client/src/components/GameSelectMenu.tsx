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

      <div className="menu-welcome-text">
        Welcome, <span className="welcome-name">{userNickname || "Adventurer"}</span>. Select a tale to enter the Underground Empire:
      </div>

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
                <div className="game-card-status dim">
                  <span>✨ Ready for a new quest</span>
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
                      ▶ RESUME
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
                      ↺ RESTART
                    </button>
                  </>
                ) : (
                  <button
                    className="retro-btn"
                    onClick={() => onSelectGame(game.id, true)}
                    disabled={isExecuting}
                  >
                    ▶ START GAME
                  </button>
                )}

                <button
                  className="retro-btn"
                  onClick={() => onOpenSaveSlots(game.id)}
                >
                  💾 SAVES
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Menu info */}
      <div className="menu-footer-actions">
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
