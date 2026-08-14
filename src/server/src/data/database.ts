import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import { rootServer } from '@rootsdk/server-app';

export interface DbGameSession {
  user_id: string;
  game_id: string;
  is_active: number;
  state_buffer: string; // base64
  location: string;
  score: number;
  moves: number;
  transcript: string; // JSON array of string lines
  updated_at: string;
}

export interface DbSaveSlot {
  id: string;
  user_id: string;
  game_id: string;
  slot_name: string;
  description: string;
  location: string;
  score: number;
  moves: number;
  state_buffer: string; // base64
  created_at: string;
}

export interface DbLeaderboardEntry {
  user_id: string;
  game_id: string;
  username: string;
  score: number;
  moves: number;
  location: string;
  updated_at: string;
}

export class ZorkDatabase {
  private db: sqlite3.Database | null = null;

  public getDb(): sqlite3.Database {
    if (!this.db) {
      const rootDbPath = (rootServer as any)?.dataStore?.config?.sqlite3?.filename;
      const dbPath = rootDbPath || path.join(__dirname, '..', '..', 'rootsdk.sqlite3');
      console.log(`[ZorkDatabase] Connecting to SQLite database at: ${dbPath}`);
      this.db = new sqlite3.Database(dbPath);
      this.initializeTables();
    }
    return this.db;
  }

  private initializeTables(): void {
    if (!this.db) return;

    const createSessionsSQL = `
      CREATE TABLE IF NOT EXISTS game_sessions (
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        state_buffer TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL DEFAULT 0,
        moves INTEGER NOT NULL DEFAULT 0,
        transcript TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id)
      )
    `;

    const createSaveSlotsSQL = `
      CREATE TABLE IF NOT EXISTS save_slots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        slot_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL DEFAULT 0,
        moves INTEGER NOT NULL DEFAULT 0,
        state_buffer TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createLeaderboardSQL = `
      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        username TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        moves INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id)
      )
    `;

    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_leaderboard ON leaderboard_entries (game_id, score DESC, moves ASC)
    `;

    const createUserPrefsSQL = `
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        last_active_game_id TEXT NOT NULL DEFAULT 'zork1',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db?.run(createSessionsSQL);
      this.db?.run(createSaveSlotsSQL);
      this.db?.run(createLeaderboardSQL);
      this.db?.run(createIndexSQL);
      this.db?.run(createUserPrefsSQL);
    });
  }

  public async saveSession(
    userId: string,
    gameId: string,
    stateBuffer: Uint8Array,
    location: string,
    score: number,
    moves: number,
    transcript: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO game_sessions
        (user_id, game_id, is_active, state_buffer, location, score, moves, transcript, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const base64Buf = Buffer.from(stateBuffer).toString('base64');
      const transcriptJson = JSON.stringify(transcript);
      this.getDb().run(
        sql,
        [userId, gameId, base64Buf, location, score, moves, transcriptJson],
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  public async getSession(userId: string, gameId: string): Promise<DbGameSession | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM game_sessions WHERE user_id = ? AND game_id = ?`;
      this.getDb().get(sql, [userId, gameId], (err, row: DbGameSession | undefined) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  public async getAllSessionsForUser(userId: string): Promise<DbGameSession[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM game_sessions WHERE user_id = ?`;
      this.getDb().all(sql, [userId], (err, rows: DbGameSession[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async deleteSession(userId: string, gameId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM game_sessions WHERE user_id = ? AND game_id = ?`;
      this.getDb().run(sql, [userId, gameId], err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async createSaveSlot(
    slot: {
      id: string;
      userId: string;
      gameId: string;
      slotName: string;
      description: string;
      location: string;
      score: number;
      moves: number;
      stateBuffer: Uint8Array;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO save_slots
        (id, user_id, game_id, slot_name, description, location, score, moves, state_buffer, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const base64Buf = Buffer.from(slot.stateBuffer).toString('base64');
      this.getDb().run(
        sql,
        [
          slot.id,
          slot.userId,
          slot.gameId,
          slot.slotName,
          slot.description,
          slot.location,
          slot.score,
          slot.moves,
          base64Buf
        ],
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  public async listSaveSlots(userId: string, gameId?: string): Promise<DbSaveSlot[]> {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM save_slots WHERE user_id = ?`;
      const params: any[] = [userId];
      if (gameId) {
        sql += ` AND game_id = ?`;
        params.push(gameId);
      }
      sql += ` ORDER BY created_at DESC`;
      this.getDb().all(sql, params, (err, rows: DbSaveSlot[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async getSaveSlot(userId: string, slotId: string): Promise<DbSaveSlot | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM save_slots WHERE user_id = ? AND id = ?`;
      this.getDb().get(sql, [userId, slotId], (err, row: DbSaveSlot | undefined) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  public async deleteSaveSlot(userId: string, slotId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM save_slots WHERE user_id = ? AND id = ?`;
      this.getDb().run(sql, [userId, slotId], err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async recordScore(
    userId: string,
    username: string,
    gameId: string,
    score: number,
    moves: number,
    location: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const selectSql = `SELECT score, moves FROM leaderboard_entries WHERE user_id = ? AND game_id = ?`;
      this.getDb().get(selectSql, [userId, gameId], (err, row: { score: number; moves: number } | undefined) => {
        if (err) return reject(err);

        if (!row) {
          // No prior entry: insert
          const insertSql = `
            INSERT INTO leaderboard_entries (user_id, game_id, username, score, moves, location, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `;
          this.getDb().run(insertSql, [userId, gameId, username, score, moves, location], insertErr => {
            if (insertErr) reject(insertErr);
            else resolve();
          });
        } else {
          // Better score or same score with fewer moves
          const isBetter = score > row.score || (score === row.score && moves < row.moves);
          if (isBetter) {
            const updateSql = `
              UPDATE leaderboard_entries
              SET username = ?, score = ?, moves = ?, location = ?, updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ? AND game_id = ?
            `;
            this.getDb().run(updateSql, [username, score, moves, location, userId, gameId], updateErr => {
              if (updateErr) reject(updateErr);
              else resolve();
            });
          } else {
            // Keep username fresh
            const updateNameSql = `UPDATE leaderboard_entries SET username = ? WHERE user_id = ? AND game_id = ?`;
            this.getDb().run(updateNameSql, [username, userId, gameId], () => resolve());
          }
        }
      });
    });
  }

  public async getLeaderboard(gameId: string, limit: number = 20): Promise<DbLeaderboardEntry[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT user_id, game_id, username, score, moves, location, updated_at
        FROM leaderboard_entries
        WHERE game_id = ?
        ORDER BY score DESC, moves ASC, updated_at ASC
        LIMIT ?
      `;
      this.getDb().all(sql, [gameId, limit], (err, rows: DbLeaderboardEntry[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async setLastActiveGame(userId: string, gameId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO user_preferences (user_id, last_active_game_id, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `;
      this.getDb().run(sql, [userId, gameId], err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getLastActiveGame(userId: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT last_active_game_id FROM user_preferences WHERE user_id = ?`;
      this.getDb().get(sql, [userId], (err, row: { last_active_game_id: string } | undefined) => {
        if (err) reject(err);
        else resolve(row ? row.last_active_game_id : null);
      });
    });
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const zorkDb = new ZorkDatabase();
