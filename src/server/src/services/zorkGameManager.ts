import * as fs from 'fs';
import * as path from 'path';
import { ZMachineEngine } from '../engine/zmachine';
import { zorkDb } from '../data/database';

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
    subtitle: 'Infocom Interactive Fiction - A Fantasy Story',
    releaseInfo: 'Release 119 / Serial 880429 / Inform v6.21',
    description: 'Explore the Great Underground Empire, collect the 20 legendary Treasures of Zork, and beware of the grue in the dark.',
    storyFileName: 'zork1.z3'
  },
  zork2: {
    id: 'zork2',
    title: 'ZORK II: The Wizard of Frobozz',
    subtitle: 'Infocom Interactive Fiction - Part Two of the Trilogy',
    releaseInfo: 'Release 63 / Serial 860811',
    description: 'Venture deeper into the subterranean world and overcome the mischievous, unpredictable Wizard of Frobozz.',
    storyFileName: 'zork2.z3'
  },
  zork3: {
    id: 'zork3',
    title: 'ZORK III: The Dungeon Master',
    subtitle: 'Infocom Interactive Fiction - The Final Chapter',
    releaseInfo: 'Release 25 / Serial 860811',
    description: 'Face the ultimate trial of wisdom, cunning, and moral fiber to prove yourself worthy of the Dungeon Master.',
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

export function cleanZorkOutput(text: string): string {
  if (!text) return '';
  return text.replace(/\n*>\s*$/, '').trimEnd();
}

export class ZorkGameManager {
  private storyBuffers: Map<string, Buffer> = new Map();
  private activeSessions: Map<string, ActiveSession> = new Map();

  constructor() {
    this.preloadStoryFiles();
  }

  private preloadStoryFiles(): void {
    const storiesDir = path.join(__dirname, '..', '..', 'stories');

    for (const [gameId, entry] of Object.entries(GAME_CATALOG)) {
      const fullPath = path.join(storiesDir, entry.storyFileName);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        this.storyBuffers.set(gameId, buffer);
        console.log(`[ZorkGameManager] Loading ${entry.title} from: ${fullPath}`);
      } else {
        console.warn(`[ZorkGameManager] Warning: Story file not found: ${fullPath}`);
      }
    }
  }

  private getSessionKey(userId: string, gameId: string): string {
    return `${userId}:${gameId}`;
  }

  public getStoryBuffer(gameId: string): Buffer {
    const buf = this.storyBuffers.get(gameId);
    if (!buf) {
      throw new Error(`Story file for game "${gameId}" is not loaded.`);
    }
    return buf;
  }

  public async getGameList(userId: string) {
    const lastActiveGameId = await zorkDb.getLastActiveGame(userId);
    const userSessions = await zorkDb.getAllSessionsForUser(userId);
    const sessionMap = new Map(userSessions.map(s => [s.game_id, s]));

    const games = Object.values(GAME_CATALOG).map(meta => {
      const dbSession = sessionMap.get(meta.id);
      const activeMemSession = this.activeSessions.get(this.getSessionKey(userId, meta.id));

      const hasActive = !!(dbSession || activeMemSession);
      const location = activeMemSession?.lastLocation || dbSession?.location || '';
      const score = activeMemSession?.lastScore ?? (dbSession?.score || 0);
      const moves = activeMemSession?.lastMoves ?? (dbSession?.moves || 0);
      const updatedAt = dbSession?.updated_at || '';

      return {
        id: meta.id,
        title: meta.title,
        subtitle: meta.subtitle,
        releaseInfo: meta.releaseInfo,
        description: meta.description,
        hasActiveGame: hasActive,
        lastLocation: location,
        lastScore: score,
        lastMoves: moves,
        lastUpdatedAt: updatedAt
      };
    });

    return {
      games,
      currentActiveGameId: lastActiveGameId || 'zork1'
    };
  }

  public async startGame(userId: string, gameId: string, restart: boolean = false, username: string = 'Adventurer') {
    const key = this.getSessionKey(userId, gameId);
    const storyBuffer = this.getStoryBuffer(gameId);
    const gameMeta = GAME_CATALOG[gameId] || GAME_CATALOG.zork1;

    // Check if there is an autosaved session in the database
    const existingDbSession = await zorkDb.getSession(userId, gameId);

    if (!restart && existingDbSession && existingDbSession.state_buffer) {
      try {
        const snapshotBuf = Buffer.from(existingDbSession.state_buffer, 'base64');
        const uint8Data = new Uint8Array(snapshotBuf.buffer, snapshotBuf.byteOffset, snapshotBuf.byteLength);
        const engine = new ZMachineEngine(storyBuffer);
        const restored = engine.loadSnapshot(uint8Data);

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
            lastLocation: existingDbSession.location || engine.currentStatus.location || 'Unknown',
            lastScore: existingDbSession.score || engine.currentStatus.scoreOrHours,
            lastMoves: existingDbSession.moves || engine.currentStatus.movesOrMinutes,
            isGameOver: false
          };
          this.activeSessions.set(key, session);
          await zorkDb.setLastActiveGame(userId, gameId);

          // Record score in leaderboard
          await zorkDb.recordScore(
            userId,
            username,
            gameId,
            session.lastScore,
            session.lastMoves,
            session.lastLocation
          );

          const welcomeBack = `[Resumed ${gameMeta.title} from auto-save]\nLocation: ${session.lastLocation} | Score: ${session.lastScore} | Moves: ${session.lastMoves}\n\nType 'look' or your next command.`;
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
    const cleanOutput = cleanZorkOutput(startResult.output);
    const transcript = [cleanOutput];

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

    // Record initial score in leaderboard
    await zorkDb.recordScore(
      userId,
      username,
      gameId,
      session.lastScore,
      session.lastMoves,
      session.lastLocation
    );

    return {
      success: true,
      outputText: cleanOutput,
      gameId,
      gameTitle: gameMeta.title,
      location: session.lastLocation,
      score: session.lastScore,
      moves: session.lastMoves,
      isGameOver: startResult.isGameOver
    };
  }

  public async sendCommand(userId: string, gameId: string, command: string, username: string = 'Adventurer') {
    const key = this.getSessionKey(userId, gameId);
    let session = this.activeSessions.get(key);

    if (!session) {
      await this.startGame(userId, gameId, false, username);
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
        outputText: `[Returning to Main Menu]`,
        gameId,
        location: session.lastLocation,
        score: session.lastScore,
        moves: session.lastMoves,
        isGameOver: false
      };
    }

    // Execute through Z-Machine engine
    const execResult = session.engine.sendCommand(trimmedCmd);
    const cleanOutput = cleanZorkOutput(execResult.output);

    session.lastLocation = execResult.status.location || session.lastLocation;
    session.lastScore = execResult.status.scoreOrHours;
    session.lastMoves = execResult.status.movesOrMinutes;
    session.isGameOver = execResult.isGameOver;

    // Append to transcript
    session.transcript.push(`> ${trimmedCmd}\n${cleanOutput}`);
    if (session.transcript.length > 50) {
      session.transcript = session.transcript.slice(-50);
    }

    // Update leaderboard with latest high score/moves
    try {
      await zorkDb.recordScore(
        userId,
        username,
        gameId,
        session.lastScore,
        session.lastMoves,
        session.lastLocation
      );
    } catch (err) {
      console.error('[ZorkGameManager] Leaderboard update error:', err);
    }

    // If the game ended, delete active memory session
    if (execResult.isGameOver) {
      this.activeSessions.delete(key);
    } else {
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
    }

    return {
      success: true,
      outputText: cleanOutput,
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

  public async restoreSlot(userId: string, gameId: string, slotId: string, username: string = 'Adventurer') {
    const slot = await zorkDb.getSaveSlot(userId, slotId);
    if (!slot) {
      throw new Error(`Save slot not found: ${slotId}`);
    }

    const actualGameId = slot.game_id || gameId;
    const key = this.getSessionKey(userId, actualGameId);
    const storyBuffer = this.getStoryBuffer(actualGameId);
    const engine = new ZMachineEngine(storyBuffer);
    const snapshotBuf = Buffer.from(slot.state_buffer, 'base64');
    const uint8Data = new Uint8Array(snapshotBuf.buffer, snapshotBuf.byteOffset, snapshotBuf.byteLength);
    const restored = engine.loadSnapshot(uint8Data);

    if (!restored) {
      throw new Error('Failed to deserialize save state. The save state format is invalid or corrupted.');
    }

    const session: ActiveSession = {
      userId,
      gameId: actualGameId,
      engine,
      transcript: [`[Restored save slot: ${slot.slot_name}]\nLocation: ${slot.location} | Score: ${slot.score} | Moves: ${slot.moves}`],
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
      actualGameId,
      snapshot,
      slot.location,
      slot.score,
      slot.moves,
      session.transcript
    );
    await zorkDb.setLastActiveGame(userId, actualGameId);

    // Record score in leaderboard
    await zorkDb.recordScore(
      userId,
      username,
      actualGameId,
      slot.score,
      slot.moves,
      slot.location
    );

    const message = `[Restored save slot: "${slot.slot_name}"]\nLocation: ${slot.location} | Score: ${slot.score} | Moves: ${slot.moves}\n\nType 'look' or your next command.`;
    return {
      success: true,
      outputText: message,
      gameId: actualGameId,
      location: slot.location,
      score: slot.score,
      moves: slot.moves
    };
  }

  public async getLeaderboard(
    gameId: string,
    limit: number = 20,
    nameResolver?: (userId: string) => Promise<string>
  ) {
    const rows = await zorkDb.getLeaderboard(gameId, limit);
    const entries = await Promise.all(
      rows.map(async (r, idx) => {
        let username = r.username;
        if (nameResolver && (!username || username === 'Adventurer' || username.startsWith('Adventurer '))) {
          try {
            const resolved = await nameResolver(r.user_id);
            if (resolved && resolved !== 'Adventurer' && !resolved.startsWith('Adventurer ')) {
              username = resolved;
              await zorkDb.recordScore(r.user_id, resolved, r.game_id, r.score, r.moves, r.location);
            }
          } catch {
            // ignore
          }
        }
        return {
          rank: idx + 1,
          userId: r.user_id,
          username: username || 'Adventurer',
          gameId: r.game_id,
          score: r.score,
          moves: r.moves,
          location: r.location || '',
          updatedAt: r.updated_at
        };
      })
    );

    return {
      entries,
      gameId
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
    let session = this.activeSessions.get(key);

    if (!session) {
      const dbSession = await zorkDb.getSession(userId, gameId);
      if (!dbSession) {
        return { hasActiveSession: false };
      }
      return {
        hasActiveSession: true,
        session: {
          gameId: dbSession.game_id,
          gameTitle: GAME_CATALOG[dbSession.game_id]?.title || dbSession.game_id,
          location: dbSession.location,
          score: dbSession.score,
          moves: dbSession.moves,
          transcript: JSON.parse(dbSession.transcript || '[]'),
          isGameOver: false,
          statusType: 'score'
        }
      };
    }

    return {
      hasActiveSession: true,
      session: {
        gameId: session.gameId,
        gameTitle: GAME_CATALOG[session.gameId]?.title || session.gameId,
        location: session.lastLocation,
        score: session.lastScore,
        moves: session.lastMoves,
        transcript: session.transcript,
        isGameOver: session.isGameOver,
        statusType: 'score'
      }
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
