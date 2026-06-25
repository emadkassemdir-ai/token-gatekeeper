# 🟩 VoxelCraft

A massively-featured, performance-optimized 3D block sandbox engine — a
Minecraft-style game built from scratch with **Vite** + **Three.js**, no game
engine and no backend. Runs entirely in the browser and deploys to static
hosting (GitHub Pages).

## ✨ Features

- **World** — chunked `InstancedMesh` renderer with per-chunk frustum culling
  and exposed-block culling; pure-JS seeded Perlin/Simplex noise. Six biomes
  (plains, desert, mountain w/ snowy peaks, snowy forest, jungle, ocean),
  caves, depth-gated ores (coal → iron → gold → diamond), villages, and a
  day/night cycle.
- **Player** — first-person PointerLock controller, AABB collision, gravity,
  variable-height jump, fly mode and swimming. Full on-screen **touch controls**
  (joystick, drag-to-look, hold-to-mine, tap-to-place) with iPad safe-area
  support.
- **Survival & Creative** — 27-slot inventory + inventory screen, avatar
  customization, health / hunger / armor bars. Creative has an infinite palette.
- **Crafting & Smelting** — crafting table + furnace; tool tiers
  (wood → stone → iron → gold → diamond pickaxe/axe/sword), armor sets, and food
  cooking. Mining speed scales with tool tier.
- **Mobs & Combat** — zombies, creepers (5-heart explosion + craters), and
  passive cows / sheep / fish / squid that drop food. Armor reduces damage; raw
  food can poison you.
- **Worlds** — multiple saved worlds, a *Create World* flow with a seed,
  game mode, difficulty (peaceful → hardcore, with permadeath) and a cheats
  toggle.
- **Multiplayer** — WebRTC peer-to-peer for up to **4 players** with serverless
  copy-paste signalling; synced player positions, block edits and chat, with 3D
  remote avatars.

## 🚀 Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## 🎮 Controls

**Desktop**

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse (click canvas to lock) |
| Jump / fly up | `Space` |
| Toggle fly | `F` |
| Select hotbar | `1`–`9` / scroll |
| Mine / attack | Hold left-click |
| Place / eat / equip | Right-click |
| Crafting | `E` · Furnace `G` · Inventory `I` · Chat `T` · Multiplayer `M` |

**Touch** — left joystick to move, drag the right side to look, **hold** on the
world to mine, **tap** to place; on-screen buttons for Jump / Fly / Down and
Bag / Craft / Smelt / Multiplayer / Chat.

## 🌐 Multiplayer (real-device testing)

There is no server — peers connect directly with copy-paste codes:

1. **Host:** open the Multiplayer menu (`M` / 🌐), *Host* tab → **Create
   Invite** → copy the code to a friend (text/DM).
2. **Guest:** *Join* tab → paste the invite → **Generate Reply** → send the
   reply code back to the host.
3. **Host:** paste the reply → **Connect Guest**. Repeat for up to 3 guests.

Once connected you'll see each other move, share block edits, and chat. (P2P
connectivity depends on the browser and network/NAT; a public STUN server is
used for connection setup.)

### Sign in with Google (optional)

Players can sign in with Google so their Google display name becomes their
multiplayer identity instead of a typed username. It's fully client-side and
**off by default** — to enable it, create an OAuth **Client ID** in Google
Cloud Console (add your site origin, e.g. your GitHub Pages URL, as an
Authorized JavaScript origin) and expose it before the app script in
`index.html`:

```html
<script>window.VOXELCRAFT_GOOGLE_CLIENT_ID = 'YOUR_ID.apps.googleusercontent.com';</script>
```

When no Client ID is set (or the Google SDK can't load), the button is hidden
and the game falls back to a manual username. There's no backend, so the ID
token isn't verified server-side — it's a convenience identity, not a security
boundary.

## 🧪 Cheats (25 commands)

Enable **cheats** when creating a world, then open chat (`T`). Always available:
`/help` `/seed` `/pos`. Cheat commands:

```
/gamemode <survival|creative>   /difficulty <peaceful|easy|normal|hard|hardcore>
/give <item> [n]   /giveall   /clear   /tp <x> <y> <z>   /home   /setspawn
/heal   /sethealth <n>   /feed   /hurt <n>   /kill   /god   /fly
/speed <n>   /noclip   /reach <n>   /time <day|noon|night|midnight|0-1>
/spawn <mob> [n]   /killall   /smite
```

## 🗂 Architecture

```
src/
  main.js                 bootstrap + game loop
  world/                  BlockTypes, ItemTypes, NoiseGenerator, World
  state/                  Inventory, Crafting, Smelting, PlayerStats,
                          Avatar, WorldStore, PlayerProfile
  player/                 PhysicsEngine, InteractionEngine
  entities/               Mob, EntityManager
  net/                    Protocol, NetworkManager, RemotePlayers
  ui/                     GameMenu, HUD, TouchControls, Chat, CraftingMenu,
                          SmeltingMenu, InventoryScreen, AvatarEditor,
                          MultiplayerMenu
```

Deployed to GitHub Pages via `.github/workflows/main.yml`.
