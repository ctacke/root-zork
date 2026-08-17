import React, { useState, useEffect, useCallback } from "react";
import { rootClient } from "@rootsdk/client-app";
import { ZorkServiceClient } from "@zork/gen-client";
import { GameInfo, SaveSlotInfo } from "@zork/gen-shared";
import { StatusBar } from "./components/StatusBar";
import { Console, LogEntry } from "./components/Console";
import { GameSelectMenu } from "./components/GameSelectMenu";
import { SaveLoadModal } from "./components/SaveLoadModal";
import { HelpModal } from "./components/HelpModal";
import { LeaderboardModal } from "./components/LeaderboardModal";
import "./App.css";

const client = new ZorkServiceClient();

const cleanOutput = (text: string): string => {
  if (!text) return "";
  return text.replace(/\n*>\s*$/, "").trimEnd();
};

export const App: React.FC = () => {
  const [view, setView] = useState<"menu" | "game">("menu");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [activeGameId, setActiveGameId] = useState<string>("zork1");
  const [activeGameTitle, setActiveGameTitle] = useState<string>("ZORK I");
  const [location, setLocation] = useState<string>("West of House");
  const [score, setScore] = useState<number>(0);
  const [moves, setMoves] = useState<number>(0);
  const [statusType] = useState<string>("score");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [userNickname, setUserNickname] = useState<string>("Adventurer");

  // Modals & Overlay state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [leaderboardGameId, setLeaderboardGameId] = useState<string>("zork1");
  const [saveSlots, setSaveSlots] = useState<SaveSlotInfo[]>([]);
  const [scanlinesEnabled, setScanlinesEnabled] = useState<boolean>(true);

  const fetchUserProfile = async () => {
    try {
      const userId = rootClient.users.getCurrentUserId();
      if (userId) {
        const profile = await rootClient.users.getUserProfile(userId as unknown as string);
        if (profile?.nickname) {
          setUserNickname(profile.nickname);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadGameList = useCallback(async () => {
    try {
      const resp = await client.getGameList({});
      if (resp.games) {
        setGames(resp.games);
      }
      if (resp.userNickname) {
        setUserNickname(prev => prev === "Adventurer" ? resp.userNickname : prev);
      }
      if (resp.currentActiveGameId) {
        setActiveGameId(resp.currentActiveGameId);
      }
    } catch (err) {
      console.error("Failed to load game list:", err);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();
    loadGameList();
  }, [loadGameList]);

  // Load save slots for a game
  const loadSaveSlots = async (targetGameId?: string) => {
    try {
      const resp = await client.listSaveSlots({ gameId: targetGameId || activeGameId });
      if (resp.slots) {
        setSaveSlots(resp.slots);
      }
    } catch (err) {
      console.error("Failed to list save slots:", err);
    }
  };

  const handleOpenLeaderboard = (gameId?: string) => {
    setLeaderboardGameId(gameId || activeGameId || "zork1");
    setIsLeaderboardOpen(true);
  };

  // Start or resume a game
  const handleSelectGame = async (gameId: string, restart: boolean = false) => {
    setIsExecuting(true);
    setActiveGameId(gameId);
    try {
      const resp = await client.startGame({ gameId, restart });
      if (resp.success) {
        setActiveGameTitle(resp.gameTitle || gameId.toUpperCase());
        setLocation(resp.location || "Unknown");
        setScore(resp.score || 0);
        setMoves(resp.moves || 0);
        setLogs([
          {
            id: `start_${Date.now()}`,
            type: "output",
            text: cleanOutput(resp.outputText || "")
          }
        ]);
        setView("game");
      }
    } catch (err: any) {
      console.error("Error starting game:", err);
    } finally {
      setIsExecuting(false);
      loadGameList();
    }
  };

  // Send player command
  const handleSendCommand = async (command: string) => {
    const trimmed = command.trim();

    if (trimmed.toLowerCase() === "menu" || trimmed.toLowerCase() === "exit") {
      setView("menu");
      loadGameList();
      return;
    }

    if (trimmed.toLowerCase() === "clear" || trimmed.toLowerCase() === "cls") {
      setLogs([]);
      return;
    }

    if (trimmed.toLowerCase() === "save") {
      await loadSaveSlots(activeGameId);
      setIsSaveModalOpen(true);
      return;
    }

    if (trimmed.toLowerCase() === "restore") {
      await loadSaveSlots(activeGameId);
      setIsSaveModalOpen(true);
      return;
    }

    if (
      trimmed.toLowerCase() === "leaderboard" ||
      trimmed.toLowerCase() === "top" ||
      trimmed.toLowerCase() === "top20" ||
      trimmed.toLowerCase() === "scores" ||
      trimmed.toLowerCase() === "highscores" ||
      trimmed.toLowerCase() === "halloffame"
    ) {
      handleOpenLeaderboard(activeGameId);
      return;
    }

    if (trimmed.toLowerCase() === "help" || trimmed.toLowerCase() === "hint" || trimmed.toLowerCase() === "hints") {
      setIsHelpModalOpen(true);
      return;
    }

    // Add player command echo
    setLogs(prev => [
      ...prev,
      {
        id: `cmd_${Date.now()}`,
        type: "command",
        text: `> ${command}`
      }
    ]);

    setIsExecuting(true);
    try {
      const resp = await client.sendCommand({ gameId: activeGameId, command });
      if (resp.success) {
        setLocation(resp.location || location);
        setScore(resp.score);
        setMoves(resp.moves);

        const cleaned = cleanOutput(resp.outputText || "");
        if (cleaned) {
          setLogs(prev => [
            ...prev,
            {
              id: `out_${Date.now()}`,
              type: "output",
              text: cleaned
            }
          ]);
        }

        // When game terminates (e.g. player quits with 'y' or dies/game over)
        if (resp.isGameOver) {
          setLogs(prev => [
            ...prev,
            {
              id: `over_${Date.now()}`,
              type: "system",
              text: `[Game Session Ended. Returning to Main Menu...]`
            }
          ]);

          setTimeout(() => {
            setView("menu");
            loadGameList();
          }, 1500);
        }
      }
    } catch (err: any) {
      console.error("Error sending command:", err);
      setLogs(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          type: "system",
          text: `[Error: ${err.message || "Command execution failed"}]`
        }
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Save to slot
  const handleSaveSlot = async (slotName: string, description: string) => {
    const resp = await client.saveSlot({
      gameId: activeGameId,
      slotName,
      description
    });
    if (resp.success) {
      setLogs(prev => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          type: "system",
          text: `[Game state saved to slot: "${slotName}"]`
        }
      ]);
      await loadSaveSlots(activeGameId);
    }
  };

  // Restore from slot
  const handleRestoreSlot = async (slotId: string, gameId: string) => {
    const resp = await client.restoreSlot({
      gameId: gameId || activeGameId,
      slotId
    });
    if (resp.success) {
      setActiveGameId(gameId || activeGameId);
      setLocation(resp.location);
      setScore(resp.score);
      setMoves(resp.moves);
      setLogs([
        {
          id: `restore_${Date.now()}`,
          type: "system",
          text: cleanOutput(resp.outputText || `[Restored save slot]`)
        }
      ]);
      setView("game");
      loadGameList();
    }
  };

  // Delete slot
  const handleDeleteSlot = async (slotId: string) => {
    await client.deleteSaveSlot({ slotId, gameId: activeGameId });
    await loadSaveSlots(activeGameId);
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInputActive =
        document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

      if (isInputActive) {
        if (e.key === "Escape" && view === "game" && !isSaveModalOpen && !isHelpModalOpen && !isLeaderboardOpen) {
          setView("menu");
          loadGameList();
        }
        return;
      }

      if (isSaveModalOpen || isHelpModalOpen || isLeaderboardOpen) {
        return;
      }

      if (view === "menu") {
        if (e.key === "1") handleSelectGame("zork1", false);
        if (e.key === "2") handleSelectGame("zork2", false);
        if (e.key === "3") handleSelectGame("zork3", false);
        if (e.key.toLowerCase() === "r") handleSelectGame(activeGameId, false);
        if (e.key.toLowerCase() === "l") handleOpenLeaderboard(activeGameId);
        if (e.key.toLowerCase() === "h" || e.key === "?") setIsHelpModalOpen(true);
      } else if (view === "game") {
        if (e.key === "Escape") {
          setView("menu");
          loadGameList();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [view, activeGameId, isSaveModalOpen, isHelpModalOpen, isLeaderboardOpen, loadGameList]);

  return (
    <div className="zork-app-wrapper">
      <div className={`crt-monitor ${scanlinesEnabled ? "crt-mode-on" : "crt-mode-off"}`}>
        {/* CRT Scanline & Curvature Overlays */}
        {scanlinesEnabled && (
          <>
            <div className="crt-scanlines" />
            <div className="crt-vignette" />
          </>
        )}

        {/* Top Status Header */}
        <StatusBar
          location={location}
          score={score}
          moves={moves}
          gameTitle={activeGameTitle}
          statusType={statusType}
          isGameView={view === "game"}
          onOpenMenu={() => {
            setView("menu");
            loadGameList();
          }}
          onOpenSaveModal={() => {
            loadSaveSlots(activeGameId);
            setIsSaveModalOpen(true);
          }}
          onOpenLeaderboard={() => handleOpenLeaderboard(activeGameId)}
          onOpenHelpModal={() => setIsHelpModalOpen(true)}
          onClearTerminal={() => setLogs([])}
          scanlinesEnabled={scanlinesEnabled}
          onToggleScanlines={() => setScanlinesEnabled(prev => !prev)}
        />

        {/* Main Content Area: Menu or Pure Scrolling Console */}
        {view === "menu" ? (
          <GameSelectMenu
            games={games}
            currentActiveGameId={activeGameId}
            onSelectGame={handleSelectGame}
            onOpenSaveSlots={targetGameId => {
              loadSaveSlots(targetGameId);
              setIsSaveModalOpen(true);
            }}
            onOpenLeaderboard={targetGameId => handleOpenLeaderboard(targetGameId)}
            isExecuting={isExecuting}
            userNickname={userNickname}
          />
        ) : (
          <Console
            logs={logs}
            isExecuting={isExecuting}
            onSendCommand={handleSendCommand}
          />
        )}

        {/* Save/Load Slots Modal */}
        <SaveLoadModal
          isOpen={isSaveModalOpen}
          gameId={activeGameId}
          gameTitle={activeGameTitle}
          currentLocation={location}
          currentScore={score}
          currentMoves={moves}
          slots={saveSlots}
          onClose={() => setIsSaveModalOpen(false)}
          onSaveSlot={handleSaveSlot}
          onRestoreSlot={handleRestoreSlot}
          onDeleteSlot={handleDeleteSlot}
        />

        {/* Guide & Help Modal */}
        <HelpModal
          isOpen={isHelpModalOpen}
          onClose={() => setIsHelpModalOpen(false)}
        />

        {/* Top 20 Leaderboard Modal */}
        <LeaderboardModal
          isOpen={isLeaderboardOpen}
          initialGameId={leaderboardGameId}
          currentUserNickname={userNickname}
          client={client}
          onClose={() => setIsLeaderboardOpen(false)}
        />
      </div>
    </div>
  );
};

export default App;
