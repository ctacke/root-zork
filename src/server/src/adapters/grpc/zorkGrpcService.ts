import { rootServer } from "@rootsdk/server-app";
import { ZorkServiceBase } from "@zork/gen-server";
import {
  GetGameListRequest,
  GetGameListResponse,
  StartGameRequest,
  StartGameResponse,
  SendCommandRequest,
  SendCommandResponse,
  SaveSlotRequest,
  SaveSlotResponse,
  RestoreSlotRequest,
  RestoreSlotResponse,
  ListSaveSlotsRequest,
  ListSaveSlotsResponse,
  DeleteSaveSlotRequest,
  DeleteSaveSlotResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  GetActiveSessionRequest,
  GetActiveSessionResponse,
  AbandonGameRequest,
  AbandonGameResponse,
  GameInfo,
  SaveSlotInfo,
  LeaderboardEntry
} from "@zork/gen-shared";
import { zorkGameManager } from "../../services/zorkGameManager";

type Client = any;

export class ZorkGrpcService extends ZorkServiceBase {
  private userNameCache = new Map<string, string>();

  private getUserId(client: Client): string {
    const id = client?.userId || client?.user?.id || client?.user_id;
    if (!id || id.trim() === "") {
      return "guest-adventurer";
    }
    return id;
  }

  public async resolveUserName(userId: string, client?: Client): Promise<string> {
    if (!userId || userId === "guest-adventurer") {
      return "Adventurer";
    }

    if (this.userNameCache.has(userId)) {
      return this.userNameCache.get(userId)!;
    }

    // 1. Try resolving via Root Platform Community Members API
    try {
      const userInfo = await rootServer.community.communityMembers.get({
        userId: userId as any
      });
      const u = userInfo as any;
      const name = u?.nickname || u?.displayName || u?.name || u?.username;
      if (name && typeof name === "string" && name.trim()) {
        console.log(`[ZorkGrpcService] Resolved Root member name for ${userId}: "${name.trim()}"`);
        this.userNameCache.set(userId, name.trim());
        return name.trim();
      }
    } catch (err) {
      // ignore
    }

    // 2. Check client context object
    const c = client as any;
    const clientName =
      c?.user?.nickname ||
      c?.user?.displayName ||
      c?.user?.name ||
      c?.user?.username ||
      c?.nickname;

    if (clientName && typeof clientName === "string" && clientName.trim() && clientName !== "Adventurer") {
      this.userNameCache.set(userId, clientName.trim());
      return clientName.trim();
    }

    // 3. Fallback to generic name with short ID
    const shortId = userId.length > 6 ? userId.slice(-6) : userId;
    return `Adventurer ${shortId}`;
  }

  async getGameList(request: GetGameListRequest, client: Client): Promise<GetGameListResponse> {
    const userId = this.getUserId(client);
    const userNickname = await this.resolveUserName(userId, client);
    const result = await zorkGameManager.getGameList(userId);

    const gameInfos: GameInfo[] = result.games.map(g => ({
      id: g.id,
      title: g.title,
      subtitle: g.subtitle,
      releaseInfo: g.releaseInfo,
      description: g.description,
      hasActiveGame: g.hasActiveGame,
      lastLocation: g.lastLocation,
      lastScore: g.lastScore,
      lastMoves: g.lastMoves,
      lastUpdatedAt: g.lastUpdatedAt
    }));

    return {
      games: gameInfos,
      currentActiveGameId: result.currentActiveGameId,
      userNickname
    };
  }

  async startGame(request: StartGameRequest, client: Client): Promise<StartGameResponse> {
    const userId = this.getUserId(client);
    const userNickname = await this.resolveUserName(userId, client);
    const gameId = request.gameId || "zork1";
    const restart = !!request.restart;

    console.log(`[ZorkGrpcService] startGame for userId: "${userId}" (${userNickname}), gameId: "${gameId}", restart: ${restart}`);
    const result = await zorkGameManager.startGame(userId, gameId, restart, userNickname);

    return {
      success: result.success,
      outputText: result.outputText,
      gameId: result.gameId,
      gameTitle: result.gameTitle,
      location: result.location,
      score: result.score,
      moves: result.moves,
      isGameOver: result.isGameOver
    };
  }

  async sendCommand(request: SendCommandRequest, client: Client): Promise<SendCommandResponse> {
    const userId = this.getUserId(client);
    const userNickname = await this.resolveUserName(userId, client);
    const gameId = request.gameId || "zork1";
    const command = request.command || "";

    const result = await zorkGameManager.sendCommand(userId, gameId, command, userNickname);

    return {
      success: result.success,
      outputText: result.outputText,
      gameId: result.gameId,
      location: result.location,
      score: result.score,
      moves: result.moves,
      isGameOver: result.isGameOver
    };
  }

  async saveSlot(request: SaveSlotRequest, client: Client): Promise<SaveSlotResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || "zork1";
    const slotName = request.slotName || "";
    const description = request.description || "";

    console.log(`[ZorkGrpcService] saveSlot "${slotName}" for userId: "${userId}", gameId: "${gameId}"`);
    const result = await zorkGameManager.saveSlot(userId, gameId, slotName, description);

    return {
      success: result.success,
      message: result.message,
      slot: result.slot as SaveSlotInfo
    };
  }

  async restoreSlot(request: RestoreSlotRequest, client: Client): Promise<RestoreSlotResponse> {
    const userId = this.getUserId(client);
    const userNickname = await this.resolveUserName(userId, client);
    const gameId = request.gameId || "zork1";
    const slotId = request.slotId || "";

    console.log(`[ZorkGrpcService] restoreSlot "${slotId}" for userId: "${userId}", gameId: "${gameId}"`);
    const result = await zorkGameManager.restoreSlot(userId, gameId, slotId, userNickname);

    return {
      success: result.success,
      outputText: result.outputText,
      gameId: result.gameId,
      location: result.location,
      score: result.score,
      moves: result.moves
    };
  }

  async listSaveSlots(request: ListSaveSlotsRequest, client: Client): Promise<ListSaveSlotsResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || undefined;

    const result = await zorkGameManager.listSaveSlots(userId, gameId);
    console.log(`[ZorkGrpcService] listSaveSlots for userId: "${userId}", gameId: "${gameId || 'all'}" -> ${result.slots.length} slots found`);

    return {
      slots: result.slots as SaveSlotInfo[]
    };
  }

  async deleteSaveSlot(request: DeleteSaveSlotRequest, client: Client): Promise<DeleteSaveSlotResponse> {
    const userId = this.getUserId(client);
    const slotId = request.slotId || "";

    console.log(`[ZorkGrpcService] deleteSaveSlot "${slotId}" for userId: "${userId}"`);
    const result = await zorkGameManager.deleteSaveSlot(userId, slotId);

    return {
      success: result.success
    };
  }

  async getLeaderboard(request: GetLeaderboardRequest, client: Client): Promise<GetLeaderboardResponse> {
    const gameId = request.gameId || "zork1";
    const limit = request.limit || 20;

    const result = await zorkGameManager.getLeaderboard(gameId, limit, async userId => {
      return await this.resolveUserName(userId, client);
    });

    return {
      entries: result.entries as LeaderboardEntry[],
      gameId: result.gameId
    };
  }

  async getActiveSession(request: GetActiveSessionRequest, client: Client): Promise<GetActiveSessionResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || "zork1";

    const result = await zorkGameManager.getActiveSession(userId, gameId);

    if (!result.hasActiveSession || !result.session) {
      return {
        hasActiveSession: false
      };
    }

    return {
      hasActiveSession: true,
      session: {
        gameId: result.session.gameId,
        gameTitle: result.session.gameTitle,
        location: result.session.location,
        score: result.session.score,
        moves: result.session.moves,
        transcript: result.session.transcript,
        isGameOver: result.session.isGameOver,
        statusType: result.session.statusType
      }
    };
  }

  async abandonGame(request: AbandonGameRequest, client: Client): Promise<AbandonGameResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || "zork1";

    const result = await zorkGameManager.abandonGame(userId, gameId);

    return {
      success: result.success
    };
  }
}
