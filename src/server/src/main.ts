import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { ZorkGrpcService } from "./adapters/grpc/zorkGrpcService";

const zorkService = new ZorkGrpcService();

async function onStarting(state: RootAppStartState) {
  console.log("⚔️  Zork Server starting for community:", state.communityId);
  rootServer.lifecycle.addService(zorkService);
}

(async () => {
  console.log('\n🗡️  ===== STARTING ZORK TRILOGY SERVER =====');
  await rootServer.lifecycle.start(onStarting);
  console.log('✅ ===== ZORK TRILOGY SERVER READY =====\n');
})();
