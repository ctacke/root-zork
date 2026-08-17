# ⚔️ Zork Trilogy for Root Platform

Welcome to the **Zork Trilogy** ported to the [Root Platform](https://rootapp.com) by **Chris Tacke**.

Because the historic Infocom source code and story files for the Zork trilogy are open source under the MIT license, this project serves as a practical, end-to-end example of building a rich, interactive, full-stack Root application with persistent storage, custom gRPC networking, community member integration, and a retro terminal UI.

It also serves as a reference implementation for **automated CI/CD packaging and publishing** to the Root Developer Portal directly via GitHub Actions.

---

## 🗡️ The Games

This package bundles the complete, authentic trilogy:

1. **Zork I: The Great Underground Empire** (Release 119 / Serial 880429)  
   *Wander west of the white house, venture into the Great Underground Empire, collect the 20 legendary Treasures of Zork, and beware of the lurkings of the grue.*
2. **Zork II: The Wizard of Frobozz** (Release 63 / Serial 860811)  
   *Journey deeper into the subterranean realm and match wits with the erratic, spell-casting Wizard of Frobozz.*
3. **Zork III: The Dungeon Master** (Release 25 / Serial 860811)  
   *Undergo the final trials of wisdom, courage, and moral fiber to prove yourself worthy of the Dungeon Master.*

### Original Source & Historical References
- **Historical Source Code (MIT License)**:
  - [Zork I Historical Source (GitHub)](https://github.com/historicalsource/zork1)
  - [Zork II Historical Source (GitHub)](https://github.com/historicalsource/zork2)
  - [Zork III Historical Source (GitHub)](https://github.com/historicalsource/zork3)
- **Z-Machine Standards**:
  - [The Z-Machine Standards Document (Version 1.1)](https://inform-fiction.org/zmachine/standards/z1point1/index.html)

---

## 🏛️ Application Architecture

The application is structured as a standard Root monorepo containing networking protocols, a TypeScript backend server, and a React frontend client.

```
root-zork/
├── .github/workflows/  # CI/CD automated release & publish workflows
│   └── zork-publish.yml
├── src/
│   ├── networking/     # Protocol Buffer definitions & generated gRPC stubs
│   │   └── src/zork.proto
│   ├── server/         # TypeScript Z-Machine interpreter & game manager
│   │   ├── src/
│   │   │   ├── engine/     # Z-Machine v3 VM (opcodes, memory, serialization)
│   │   │   ├── services/   # Multi-game session management
│   │   │   ├── data/       # SQLite persistence (saves, sessions, leaderboard)
│   │   │   └── adapters/   # gRPC service adapter
│   │   └── stories/        # Z3 story binaries (zork1.z3, zork2.z3, zork3.z3)
│   ├── client/         # React + Vite green-screen CRT terminal UI
│   │   ├── src/
│   │   │   ├── components/ # Console, Menu, Leaderboard, Save/Load, Help
│   │   │   └── App.css     # Phosphor green CRT theme & responsive mobile styles
│   │   └── public/fonts/   # 100% self-contained offline monospace fonts
│   └── root-manifest.json  # Root Platform app descriptor
```

---

### 1. Z-Machine v3 Engine (`src/server/src/engine/`)
Rather than relying on external command-line binaries, the backend features a custom, pure TypeScript **Z-Machine Version 3 interpreter** designed for stateful async execution:
- **Memory & Opcodes**: Parses story headers, dynamic/static memory tables, dictionary lookup, object hierarchies, and instructions.
- **Binary State Serialization**: Captures dynamic memory, call stacks, and instruction pointers into compact binary buffers (`Uint8Array`) for instant, byte-accurate save state creation and restoration without disk I/O interrupts.

---

### 2. Networking & Protocol Buffers (`src/networking/`)
All client-to-server interactions are strongly typed via gRPC schemas defined in [`zork.proto`](file:///C:/repos/ctacke/root-zork/src/networking/src/zork.proto) and compiled with `rootsdk-protoc`:
- `StartGame`: Initializes a fresh quest or resumes an existing auto-save.
- `SendCommand`: Dispatches player verbs, updates room status, and manages game-over transitions.
- `SaveSlot` & `RestoreSlot`: Manages named custom save slots.
- `GetLeaderboard`: Fetches ranked community records.

---

### 3. Database Persistence & User Isolation (`src/server/src/data/`)
The server dynamically hooks into the Root Platform's managed SQLite storage (`rootServer.dataStore.config.sqlite3.filename`):
- **Per-User Isolation**: Save slots and autosaves are strictly partitioned by `user_id`, guaranteeing players only see their own quest history.
- **Top 20 Leaderboard**: Tracks the best score per player per game. Ranks by highest score with a fewest-moves tiebreaker.
- **Root Profile Integration**: Resolves player community member nicknames directly via `rootServer.community.communityMembers.get({ userId })`.

---

### 4. Retro Phosphor CRT Terminal Client (`src/client/`)
The web client delivers a nostalgic 1980s mainframe terminal experience:
- **Green Phosphor CRT Styling**: Monospace typography (`VT323` and `Share Tech Mono` bundled locally), glowing text bloom, screen curvature vignette, and an interactive scanline toggle (`CRT: ON/OFF`).
- **Mobile Responsive Layout**: Optimized for phone play with flexible touch cards, dynamic viewport scaling (`100dvh`), and a collapsible quick-action compass bar (`N`, `S`, `E`, `W`, `UP`, `DOWN`, `LOOK`, `INV`, `WAIT`).

---

## 🚀 CI/CD & Automated Publishing

This repository includes an automated GitHub Actions release workflow in [`.github/workflows/zork-publish.yml`](file:///C:/repos/ctacke/root-zork/.github/workflows/zork-publish.yml).

### Publishing via Version Tags
To trigger an automated build, packaging, and publish to the Root Platform:
1. Create and push a semver tag:
   ```bash
   git tag v1.0.2
   git push origin v1.0.2
   ```
2. The GitHub Action will automatically:
   - Extract the version and update [`root-manifest.json`](file:///C:/repos/ctacke/root-zork/src/root-manifest.json).
   - Install dependencies and build all workspaces (`npm ci && npm run build`).
   - Package the app bundle (`npx rootsdk build package --output-file ./dist/zork.pkg`).
   - Upload and publish to the Root Developer Portal (`dev.rootapp.com`) using your repository's `ROOTSDK_AUTH_TOKEN` secret.
   - Upload `zork.pkg` as an artifact on the GitHub Actions run.

You can also run the workflow manually at any time via **GitHub Actions > Run workflow** (`workflow_dispatch`) with an optional version override.

---

## 🛠️ Local Development & Building

### Prerequisites
- Node.js $\ge 22$
- npm $\ge 10$

### Install Dependencies
```bash
cd src
npm install
```

### Build Everything
Compiles the protobuf schemas, server TypeScript, and client production bundle:
```bash
npm run build
```

### Build & Package for Root Platform
```bash
npx rootsdk build package --output-file ./dist/zork.pkg
```

---

## 👤 Author
Ported, designed, and developed for the Root Platform by **Chris Tacke**.

---

## 📜 License
- **Infocom Zork Trilogy**: Released under the [MIT License](https://opensource.org/licenses/MIT) by Infocom / historical source archives.
- **Root Application & Wrapper**: [MIT License](LICENSE) &copy; 2026 Chris Tacke.
