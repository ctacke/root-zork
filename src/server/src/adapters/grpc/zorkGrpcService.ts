import { Client } from "@rootsdk/server-app";
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
  GetActiveSessionRequest,
  GetActiveSessionResponse,
  AbandonGameRequest,
  AbandonGameResponse,
  GameInfo,
  SaveSlotInfo
} from "@zork/gen-shared";
import { zorkGameManager } from "../../services/zorkGameManager";

export class ZorkGrpcService extends ZorkServiceBase {
  private getUserId(client: Client): string {
    return (
      (client as any)?.user?.id ||
      (client as any)?.userId ||
      (client as any)?.user_id ||
      "default_adventurer"
    );
  }

  private getUserNickname(client: Client): string {
    const c = client as any;
    return (
      c?.user?.nickname ||
      c?.user?.displayName ||
      c?.user?.name ||
      c?.user?.username ||
      c?.nickname ||
      "Adventurer"
    );
  }

  async getGameList(request: GetGameListRequest, client: Client): Promise<GetGameListResponse> {
    const userId = this.getUserId(client);
    const userNickname = this.getUserNickname(client);
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
    const gameId = request.gameId || "zork1";
    const restart = !!request.restart;

    const result = await zorkGameManager.startGame(userId, gameId, restart);

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
    const gameId = request.gameId || "zork1";
    const command = request.command || "";

    const result = await zorkGameManager.sendCommand(userId, gameId, command);

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

    const result = await zorkGameManager.saveSlot(userId, gameId, slotName, description);

    return {
      success: result.success,
      message: result.message,
      slot: result.slot as SaveSlotInfo
    };
  }

  async restoreSlot(request: RestoreSlotRequest, client: Client): Promise<RestoreSlotResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || "zork1";
    const slotId = request.slotId || "";

    const result = await zorkGameManager.restoreSlot(userId, gameId, slotId);

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

    return {
      slots: result.slots as SaveSlotInfo[]
    };
  }

  async deleteSaveSlot(request: DeleteSaveSlotRequest, client: Client): Promise<DeleteSaveSlotResponse> {
    const userId = this.getUserId(client);
    const slotId = request.slotId || "";

    const result = await zorkGameManager.deleteSaveSlot(userId, slotId);

    return {
      success: result.success
    };
  }

  async getActiveSession(request: GetActiveSessionRequest, client: Client): Promise<GetActiveSessionResponse> {
    const userId = this.getUserId(client);
    const gameId = request.gameId || "zork1";

    const result = await zorkGameManager.getActiveSession(userId, gameId);

    return {
      hasActiveSession: result.hasActiveSession,
      session: result.session ? {
        gameId: result.session.gameId,
        gameTitle: result.session.gameTitle,
        location: result.session.location,
        score: result.session.score,
        moves: result.session.moves,
        transcript: result.session.transcript,
        isGameOver: result.session.isGameOver,
        statusType: result.session.statusType
      } : undefined
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
