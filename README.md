# Root Zork Trilogy

Classic Infocom text adventure game trilogy (*Zork I*, *Zork II*, *Zork III*) packaged as a Root Platform application.

## Games Included
1. **Zork I: The Great Underground Empire** (Release 119 / Serial 880429)
2. **Zork II: The Wizard of Frobozz** (Release 63 / Serial 860811)
3. **Zork III: The Dungeon Master** (Release 25 / Serial 860811)

## Architecture
- **Protocol Buffers**: `src/networking/src/zork.proto`
- **Server**: TypeScript Z-Machine v3 engine + SQLite persistence (`src/server/`)
- **Client**: Retro phosphor green CRT terminal interface (`src/client/`)
- **Manifest**: `src/root-manifest.json`
