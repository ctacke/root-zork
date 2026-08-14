import React, { useState, useEffect, useCallback } from "react";
import { rootClient } from "@rootsdk/client-app";
import { ZorkServiceClient } from "@zork/gen-client";
import { GameInfo, SaveSlotInfo } from "@zork/gen-shared";
import { StatusBar } from "./components/StatusBar";
import { Console, LogEntry } from "./components/Console";
import { GameSelectMenu } from "./components/GameSelectMenu";
import { SaveLoadModal } from "./components/SaveLoadModal";
import { HelpModal } from "./components/HelpModal";
import "./App.css";

const client = new ZorkServiceClient();

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
            text: resp.outputText || ""
          }
        ]);
        setView("game");
      }
    } catch (err: any) {
      console.error("Error starting game:", err);
      alert(`Could not start game: ${err.message || "Unknown error"}`);
    } finally {
      setIsExecuting(false);
      loadGameList();
    }
  };

  // Send player command
  const handleSendCommand = async (command: string) => {
    if (command.toLowerCase() === "menu" || command.toLowerCase() === "exit") {
      setView("menu");
      loadGameList();
      return;
    }

    if (command.toLowerCase() === "clear" || command.toLowerCase() === "cls") {
      setLogs([]);
      return;
    }

    if (command.toLowerCase() === "save") {
      await loadSaveSlots(activeGameId);
      setIsSaveModalOpen(true);
      return;
    }

    if (command.toLowerCase() === "restore") {
      await loadSaveSlots(activeGameId);
      setIsSaveModalOpen(true);
      return;
    }

    if (command.toLowerCase() === "help" || command.toLowerCase() === "hint" || command.toLowerCase() === "hints") {
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

        setLogs(prev => [
          ...prev,
          {
            id: `out_${Date.now()}`,
            type: "output",
            text: resp.outputText || ""
          }
        ]);
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
      setLogs(prev => [
        ...prev,
        {
          id: `restore_${Date.now()}`,
          type: "system",
          text: resp.outputText || `[Restored save slot]`
        }
      ]);
      setView("game");
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
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (view === "menu" && !isSaveModalOpen && !isHelpModalOpen) {
        if (e.key === "1") handleSelectGame("zork1", false);
        if (e.key === "2") handleSelectGame("zork2", false);
        if (e.key === "3") handleSelectGame("zork3", false);
        if (e.key.toLowerCase() === "r") handleSelectGame(activeGameId, false);
        if (e.key.toLowerCase() === "h" || e.key === "?") setIsHelpModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [view, activeGameId, isSaveModalOpen, isHelpModalOpen]);

  return (
    <div className="zork-app-wrapper">
      <div className="crt-monitor">
        {/* CRT Scanline & Curvature Overlays */}
        {scanlinesEnabled && <div className="crt-scanlines" />}
        <div className="crt-vignette" />

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
            onOpenHelp={() => setIsHelpModalOpen(true)}
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
      </div>
    </div>
  );
};

export default App;
