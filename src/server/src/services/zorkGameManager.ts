import * as fs from 'fs';
import * as path from 'path';
import { ZMachineEngine, StatusLineData } from '../engine/zmachine';
import { zorkDb, DbSaveSlot } from '../data/database';

export interface GameCatalogEntry {
  id: string;
  title: string;
  subtitle: string;
  releaseInfo: string;
  description: string;
  storyFileName: string;
}

export const GAME_CATALOG: Record<string, GameCatalogEntry> = {
  zork1: {
    id: 'zork1',
    title: 'ZORK I: The Great Underground Empire',
    subtitle: 'Infocom Fantasy Story',
    releaseInfo: 'Release 119 / Serial 880429',
    description: 'Explore the Great Underground Empire, collect treasures, and beware of the grue in the dark.',
    storyFileName: 'zork1.z3'
  },
  zork2: {
    id: 'zork2',
    title: 'ZORK II: The Wizard of Frobozz',
    subtitle: 'The Wizardly Sequel',
    releaseInfo: 'Release 63 / Serial 860811',
    description: 'Venture deeper into the subterranean world and overcome the mischievous Wizard of Frobozz.',
    storyFileName: 'zork2.z3'
  },
  zork3: {
    id: 'zork3',
    title: 'ZORK III: The Dungeon Master',
    subtitle: 'The Final Test',
    releaseInfo: 'Release 25 / Serial 860811',
    description: 'Face the ultimate trial of wisdom and cunning to prove yourself worthy of the Dungeon Master.',
    storyFileName: 'zork3.z3'
  }
};

export interface ActiveSession {
  userId: string;
  gameId: string;
  engine: ZMachineEngine;
  transcript: string[];
  lastLocation: string;
  lastScore: number;
  lastMoves: number;
  isGameOver: boolean;
}

export class ZorkGameManager {
  private storyBuffers: Map<string, Buffer> = new Map();
  private activeSessions: Map<string, ActiveSession> = new Map(); // key: `${userId}:${gameId}`

  constructor() {
    this.loadStoryFiles();
  }

  private loadStoryFiles(): void {
    for (const [gameId, entry] of Object.entries(GAME_CATALOG)) {
      const candidates = [
        path.join(__dirname, '..', '..', 'stories', entry.storyFileName),
        path.join(__dirname, '..', 'stories', entry.storyFileName),
        path.join(__dirname, 'stories', entry.storyFileName),
        path.join(process.cwd(), 'stories', entry.storyFileName),
        path.join(process.cwd(), 'server', 'stories', entry.storyFileName),
        path.join(`C:/repos/historicalsource/${gameId}/COMPILED/${entry.storyFileName}`)
      ];

      let loaded = false;
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          console.log(`[ZorkGameManager] Loading ${entry.title} from: ${candidate}`);
          this.storyBuffers.set(gameId, fs.readFileSync(candidate));
          loaded = true;
          break;
        }
      }

      if (!loaded) {
        console.warn(`[ZorkGameManager] Warning: Story file not found for ${gameId}`);
      }
    }
  }

  private getSessionKey(userId: string, gameId: string): string {
    return `${userId}:${gameId}`;
  }

  public getStoryBuffer(gameId: string): Buffer {
    const buf = this.storyBuffers.get(gameId);
    if (!buf) {
      this.loadStoryFiles();
      const retryBuf = this.storyBuffers.get(gameId);
      if (!retryBuf) {
        throw new Error(`Story file not found for game: ${gameId}`);
      }
      return retryBuf;
    }
    return buf;
  }

  public async getGameList(userId: string) {
    const sessions = await zorkDb.getAllSessionsForUser(userId);
    const sessionMap = new Map(sessions.map(s => [s.game_id, s]));
    const lastActiveGame = await zorkDb.getLastActiveGame(userId);

    const list = Object.values(GAME_CATALOG).map(game => {
      const sess = sessionMap.get(game.id);
      return {
        id: game.id,
        title: game.title,
        subtitle: game.subtitle,
        releaseInfo: game.releaseInfo,
        description: game.description,
        hasActiveGame: !!sess && sess.is_active === 1,
        lastLocation: sess?.location || '',
        lastScore: sess?.score || 0,
        lastMoves: sess?.moves || 0,
        lastUpdatedAt: sess?.updated_at || ''
      };
    });

    return {
      games: list,
      currentActiveGameId: lastActiveGame || 'zork1'
    };
  }

  public async startGame(userId: string, gameId: string, restart: boolean = false) {
    const key = this.getSessionKey(userId, gameId);
    const storyBuffer = this.getStoryBuffer(gameId);
    const gameMeta = GAME_CATALOG[gameId] || GAME_CATALOG.zork1;

    // Check if there is an autosaved session in the database
    const existingDbSession = await zorkDb.getSession(userId, gameId);

    if (!restart && existingDbSession && existingDbSession.state_buffer) {
      try {
        const snapshotBuf = Buffer.from(existingDbSession.state_buffer, 'base64');
        const engine = new ZMachineEngine(storyBuffer);
        const restored = engine.loadSnapshot(snapshotBuf);

        if (restored) {
          let transcript: string[] = [];
          try {
            transcript = JSON.parse(existingDbSession.transcript || '[]');
          } catch {
            transcript = [];
          }

          const session: ActiveSession = {
            userId,
            gameId,
            engine,
            transcript,
            lastLocation: existingDbSession.location || 'Unknown',
            lastScore: existingDbSession.score || 0,
            lastMoves: existingDbSession.moves || 0,
            isGameOver: false
          };
          this.activeSessions.set(key, session);
          await zorkDb.setLastActiveGame(userId, gameId);

          const welcomeBack = `[Resumed ${gameMeta.title} from auto-save]\nLocation: ${session.lastLocation} | Score: ${session.lastScore} | Moves: ${session.lastMoves}\n\nType 'look' or your next command.\n`;
          return {
            success: true,
            outputText: welcomeBack,
            gameId,
            gameTitle: gameMeta.title,
            location: session.lastLocation,
            score: session.lastScore,
            moves: session.lastMoves,
            isGameOver: false
          };
        }
      } catch (err) {
        console.error('[ZorkGameManager] Error loading auto-save, falling back to new game:', err);
      }
    }

    // Start a fresh game
    const engine = new ZMachineEngine(storyBuffer);
    const startResult = engine.start();
    const transcript = [startResult.output];

    const session: ActiveSession = {
      userId,
      gameId,
      engine,
      transcript,
      lastLocation: startResult.status.location,
      lastScore: startResult.status.scoreOrHours,
      lastMoves: startResult.status.movesOrMinutes,
      isGameOver: startResult.isGameOver
    };
    this.activeSessions.set(key, session);

    // Save initial snapshot
    const snapshot = engine.getSnapshot();
    await zorkDb.saveSession(
      userId,
      gameId,
      snapshot,
      session.lastLocation,
      session.lastScore,
      session.lastMoves,
      transcript
    );
    await zorkDb.setLastActiveGame(userId, gameId);

    return {
      success: true,
      outputText: startResult.output,
      gameId,
      gameTitle: gameMeta.title,
      location: session.lastLocation,
      score: session.lastScore,
      moves: session.lastMoves,
      isGameOver: startResult.isGameOver
    };
  }

  public async sendCommand(userId: string, gameId: string, command: string) {
    const key = this.getSessionKey(userId, gameId);
    let session = this.activeSessions.get(key);

    if (!session) {
      await this.startGame(userId, gameId, false);
      session = this.activeSessions.get(key);
    }

    if (!session) {
      throw new Error(`Failed to initialize session for game ${gameId}`);
    }

    const trimmedCmd = command.trim();

    // Check for special internal commands
    if (trimmedCmd.toLowerCase() === 'menu' || trimmedCmd.toLowerCase() === 'exit') {
      return {
        success: true,
        outputText: `\n[Returning to Main Menu]\n`,
        gameId,
        location: session.lastLocation,
        score: session.lastScore,
        moves: session.lastMoves,
        isGameOver: false
      };
    }

    // Execute through Z-Machine engine
    const execResult = session.engine.sendCommand(trimmedCmd);
    session.lastLocation = execResult.status.location || session.lastLocation;
    session.lastScore = execResult.status.scoreOrHours;
    session.lastMoves = execResult.status.movesOrMinutes;
    session.isGameOver = execResult.isGameOver;

    // Append to transcript
    session.transcript.push(`> ${trimmedCmd}\n${execResult.output}`);
    if (session.transcript.length > 50) {
      session.transcript = session.transcript.slice(-50);
    }

    // Persist snapshot to SQLite auto-save
    try {
      const snapshot = session.engine.getSnapshot();
      await zorkDb.saveSession(
        userId,
        gameId,
        snapshot,
        session.lastLocation,
        session.lastScore,
        session.lastMoves,
        session.transcript
      );
    } catch (err) {
      console.error('[ZorkGameManager] Auto-save error:', err);
    }

    return {
      success: true,
      outputText: execResult.output,
      gameId,
      location: session.lastLocation,
      score: session.lastScore,
      moves: session.lastMoves,
      isGameOver: execResult.isGameOver
    };
  }

  public async saveSlot(userId: string, gameId: string, slotName: string, description: string) {
    const key = this.getSessionKey(userId, gameId);
    let session = this.activeSessions.get(key);
    if (!session) {
      await this.startGame(userId, gameId, false);
      session = this.activeSessions.get(key);
    }
    if (!session) {
      throw new Error('No active session to save');
    }

    const slotId = 'slot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const snapshot = session.engine.getSnapshot();
    const finalSlotName = slotName || `Save ${new Date().toLocaleTimeString()}`;

    await zorkDb.createSaveSlot({
      id: slotId,
      userId,
      gameId,
      slotName: finalSlotName,
      description: description || `Saved at ${session.lastLocation}`,
      location: session.lastLocation,
      score: session.lastScore,
      moves: session.lastMoves,
      stateBuffer: snapshot
    });

    return {
      success: true,
      message: `Game progress successfully saved to slot "${finalSlotName}".`,
      slot: {
        id: slotId,
        gameId,
        slotName: finalSlotName,
        description: description || `Saved at ${session.lastLocation}`,
        location: session.lastLocation,
        score: session.lastScore,
        moves: session.lastMoves,
        createdAt: new Date().toISOString()
      }
    };
  }

  public async restoreSlot(userId: string, gameId: string, slotId: string) {
    const slot = await zorkDb.getSaveSlot(userId, slotId);
    if (!slot) {
      throw new Error(`Save slot not found: ${slotId}`);
    }

    const key = this.getSessionKey(userId, gameId);
    const storyBuffer = this.getStoryBuffer(gameId);
    const engine = new ZMachineEngine(storyBuffer);
    const snapshotBuf = Buffer.from(slot.state_buffer, 'base64');
    const restored = engine.loadSnapshot(snapshotBuf);

    if (!restored) {
      throw new Error('Failed to deserialize save state.');
    }

    const session: ActiveSession = {
      userId,
      gameId,
      engine,
      transcript: [`[Restored save slot: ${slot.slot_name}]\nLocation: ${slot.location} | Score: ${slot.score} | Moves: ${slot.moves}\n`],
      lastLocation: slot.location,
      lastScore: slot.score,
      lastMoves: slot.moves,
      isGameOver: false
    };
    this.activeSessions.set(key, session);

    // Auto-save this restored state
    const snapshot = engine.getSnapshot();
    await zorkDb.saveSession(
      userId,
      gameId,
      snapshot,
      slot.location,
      slot.score,
      slot.moves,
      session.transcript
    );
    await zorkDb.setLastActiveGame(userId, gameId);

    const message = `[Restored save slot: "${slot.slot_name}"]\nLocation: ${slot.location} | Score: ${slot.score} | Moves: ${slot.moves}\n\nType 'look' or your next command.\n`;
    return {
      success: true,
      outputText: message,
      gameId,
      location: slot.location,
      score: slot.score,
      moves: slot.moves
    };
  }

  public async listSaveSlots(userId: string, gameId?: string) {
    const slots = await zorkDb.listSaveSlots(userId, gameId);
    return {
      slots: slots.map(s => ({
        id: s.id,
        gameId: s.game_id,
        slotName: s.slot_name,
        description: s.description,
        location: s.location,
        score: s.score,
        moves: s.moves,
        createdAt: s.created_at
      }))
    };
  }

  public async deleteSaveSlot(userId: string, slotId: string) {
    await zorkDb.deleteSaveSlot(userId, slotId);
    return { success: true };
  }

  public async getActiveSession(userId: string, gameId: string) {
    const key = this.getSessionKey(userId, gameId);
    const inMemorySession = this.activeSessions.get(key);
    const gameMeta = GAME_CATALOG[gameId] || GAME_CATALOG.zork1;

    if (inMemorySession) {
      return {
        hasActiveSession: true,
        session: {
          gameId,
          gameTitle: gameMeta.title,
          location: inMemorySession.lastLocation,
          score: inMemorySession.lastScore,
          moves: inMemorySession.lastMoves,
          transcript: inMemorySession.transcript,
          isGameOver: inMemorySession.isGameOver,
          statusType: inMemorySession.engine.statusType ? 'time' : 'score'
        }
      };
    }

    const dbSession = await zorkDb.getSession(userId, gameId);
    if (dbSession && dbSession.is_active === 1) {
      let transcript: string[] = [];
      try {
        transcript = JSON.parse(dbSession.transcript || '[]');
      } catch {
        transcript = [];
      }
      return {
        hasActiveSession: true,
        session: {
          gameId,
          gameTitle: gameMeta.title,
          location: dbSession.location,
          score: dbSession.score,
          moves: dbSession.moves,
          transcript,
          isGameOver: false,
          statusType: 'score'
        }
      };
    }

    return {
      hasActiveSession: false,
      session: undefined
    };
  }

  public async abandonGame(userId: string, gameId: string) {
    const key = this.getSessionKey(userId, gameId);
    this.activeSessions.delete(key);
    await zorkDb.deleteSession(userId, gameId);
    return { success: true };
  }
}

export const zorkGameManager = new ZorkGameManager();
