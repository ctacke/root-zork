import React, { useState, useEffect, useCallback } from "react";
import { ZorkServiceClient } from "@zork/gen-client";
import { LeaderboardEntry } from "@zork/gen-shared";

interface LeaderboardModalProps {
  isOpen: boolean;
  initialGameId?: string;
  currentUserNickname?: string;
  client: ZorkServiceClient;
  onClose: () => void;
}

const GAMES = [
  { id: "zork1", label: "ZORK I: The Great Underground Empire" },
  { id: "zork2", label: "ZORK II: The Wizard of Frobozz" },
  { id: "zork3", label: "ZORK III: The Dungeon Master" }
];

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  initialGameId = "zork1",
  currentUserNickname = "Adventurer",
  client,
  onClose
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string>(initialGameId);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchLeaderboard = useCallback(async (gameId: string) => {
    setIsLoading(true);
    try {
      const resp = await client.getLeaderboard({ gameId, limit: 20 });
      if (resp.entries) {
        setEntries(resp.entries);
      } else {
        setEntries([]);
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (isOpen) {
      setSelectedGameId(initialGameId || "zork1");
      fetchLeaderboard(initialGameId || "zork1");
    }
  }, [isOpen, initialGameId, fetchLeaderboard]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "1") {
        setSelectedGameId("zork1");
        fetchLeaderboard("zork1");
      } else if (e.key === "2") {
        setSelectedGameId("zork2");
        fetchLeaderboard("zork2");
      } else if (e.key === "3") {
        setSelectedGameId("zork3");
        fetchLeaderboard("zork3");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, fetchLeaderboard]);

  if (!isOpen) return null;

  const handleTabChange = (gameId: string) => {
    setSelectedGameId(gameId);
    fetchLeaderboard(gameId);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box leaderboard-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>🏆 HALL OF FAME &bull; TOP 20 ADVENTURERS</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body leaderboard-body">
          {/* Game Tab Switcher */}
          <div className="leaderboard-tabs">
            {GAMES.map((game, idx) => {
              const isSelected = game.id === selectedGameId;
              return (
                <button
                  key={game.id}
                  className={`leaderboard-tab-btn ${isSelected ? "active" : ""}`}
                  onClick={() => handleTabChange(game.id)}
                >
                  [{idx + 1}] {game.id.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="leaderboard-game-subtitle">
            {GAMES.find(g => g.id === selectedGameId)?.label}
          </div>

          {/* Leaderboard Table */}
          {isLoading ? (
            <div className="leaderboard-loading">LOADING HALL OF FAME RECORDS...</div>
          ) : entries.length === 0 ? (
            <div className="leaderboard-empty">
              No scores recorded for this game yet.<br />
              <span style={{ color: "var(--phosphor-dim)" }}>
                Solve puzzles, collect treasures, and be the first to claim glory!
              </span>
            </div>
          ) : (
            <div className="leaderboard-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px", textAlign: "center" }}>RANK</th>
                    <th>ADVENTURER</th>
                    <th style={{ width: "90px", textAlign: "right" }}>SCORE</th>
                    <th style={{ width: "90px", textAlign: "right" }}>MOVES</th>
                    <th>LOCATION</th>
                    <th style={{ width: "120px", textAlign: "right" }}>DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    const isSelf =
                      currentUserNickname &&
                      entry.username.toLowerCase() === currentUserNickname.toLowerCase();
                    const rankClass =
                      entry.rank === 1
                        ? "rank-1"
                        : entry.rank === 2
                        ? "rank-2"
                        : entry.rank === 3
                        ? "rank-3"
                        : "";

                    return (
                      <tr
                        key={`${entry.userId}_${entry.rank}`}
                        className={`${isSelf ? "current-user-row" : ""} ${rankClass}`}
                      >
                        <td style={{ textAlign: "center", fontWeight: "bold" }}>
                          #{entry.rank}
                        </td>
                        <td className="adventurer-cell">
                          <span className="adventurer-name">{entry.username}</span>
                          {isSelf && <span className="you-badge">(YOU)</span>}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "bold", color: "var(--phosphor-bright)" }}>
                          {entry.score}
                        </td>
                        <td style={{ textAlign: "right", color: "var(--phosphor-dim)" }}>
                          {entry.moves}
                        </td>
                        <td className="location-cell" title={entry.location}>
                          {entry.location || "Underground Empire"}
                        </td>
                        <td style={{ textAlign: "right", fontSize: "11px", opacity: 0.75 }}>
                          {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="leaderboard-footer">
            <span>Sorted by: <strong>Highest Score</strong> &bull; Tiebreaker: <strong>Fewest Moves</strong></span>
            <button className="retro-btn" onClick={onClose}>
              [ESC] CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
