import * as sqlite3 from 'sqlite3';
import * as path from 'path';

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

export class ZorkDatabase {
  private db: sqlite3.Database;

  constructor() {
    const dbPath = path.join(__dirname, '..', '..', 'rootsdk.sqlite3');
    this.db = new sqlite3.Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
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

    const createUserPrefsSQL = `
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        last_active_game_id TEXT NOT NULL DEFAULT 'zork1',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createSessionsSQL);
      this.db.run(createSaveSlotsSQL);
      this.db.run(createUserPrefsSQL);
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
      this.db.run(
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
      this.db.get(sql, [userId, gameId], (err, row: DbGameSession | undefined) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  public async getAllSessionsForUser(userId: string): Promise<DbGameSession[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM game_sessions WHERE user_id = ?`;
      this.db.all(sql, [userId], (err, rows: DbGameSession[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async deleteSession(userId: string, gameId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM game_sessions WHERE user_id = ? AND game_id = ?`;
      this.db.run(sql, [userId, gameId], err => {
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
      this.db.run(
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
      this.db.all(sql, params, (err, rows: DbSaveSlot[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async getSaveSlot(userId: string, slotId: string): Promise<DbSaveSlot | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM save_slots WHERE user_id = ? AND id = ?`;
      this.db.get(sql, [userId, slotId], (err, row: DbSaveSlot | undefined) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  public async deleteSaveSlot(userId: string, slotId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM save_slots WHERE user_id = ? AND id = ?`;
      this.db.run(sql, [userId, slotId], err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async setLastActiveGame(userId: string, gameId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO user_preferences (user_id, last_active_game_id, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `;
      this.db.run(sql, [userId, gameId], err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getLastActiveGame(userId: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT last_active_game_id FROM user_preferences WHERE user_id = ?`;
      this.db.get(sql, [userId], (err, row: { last_active_game_id: string } | undefined) => {
        if (err) reject(err);
        else resolve(row ? row.last_active_game_id : null);
      });
    });
  }

  public close(): void {
    this.db.close();
  }
}

export const zorkDb = new ZorkDatabase();
