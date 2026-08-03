# RiftCrowd LIVE — Blender → Godot Handoff Report

**Phase 13 deliverable** · Generated from `game/assets/blender/RiftCrowd_Master_P13_ExportReady.blend` (Blender 5.2 LTS)
**Export root:** `game/assets/exports/`

---

## 1. File Inventory

### Characters (`exports/characters/`)
| File | Size | Animations | Sockets | Skin joints |
|---|---|---|---|---|
| RC_Blue_Captain.glb | 2.9 MB | 12 humanoid | 3 | 46 |
| RC_Red_Captain.glb | 2.9 MB | 12 humanoid | 3 | 46 |
| RC_Blue_Champion.glb | 2.6 MB | 12 humanoid | 3 | 46 |
| RC_Red_Champion.glb | 2.6 MB | 12 humanoid | 3 | 46 |
| RC_Blue_Guardian.glb | 2.6 MB | 12 humanoid | 3 | 46 |
| RC_Red_Guardian.glb | 2.6 MB | 12 humanoid | 3 | 46 |
| RC_Blue_Striker.glb | 2.5 MB | 12 humanoid | 3 | 46 |
| RC_Red_Striker.glb | 2.5 MB | 12 humanoid | 3 | 46 |
| RC_RiftGuardian_Boss.glb | 0.96 MB | 7 boss | 4 | 22 |

### Environment (`exports/environment/`)
- `RC_Fortress_Blue.glb` (37 KB, 13 meshes, 2 sockets)
- `RC_Fortress_Red.glb` (37 KB, 13 meshes, 2 sockets)
- `RC_Arena_Master.glb` (97 KB — ground, lanes, rocks, mountains, trees, ruins)

### Objectives (`exports/objectives/`)
- `RC_Objective_Crown.glb` (10 KB, 1 socket: CaptureCenter)

### VFX (`exports/vfx/`)
- `RC_VFX_ProjectileGold.glb` (3 KB, 1 socket: Impact, forward = local −Z)
- `RC_VFX_CaptureZone.glb` (6 KB, ring + fill, radius 6.5 m)

> Lighting/state scenes (Day / Dusk / RiftCrisis / SuddenDeath) are **not** exported — shared geometry is exported once; recreate the four looks in Godot with `WorldEnvironment` + `DirectionalLight3D` (see §10).

---

## 2. Scale and Axis Conventions

- **1 Blender unit = 1 meter.** Export scale 1.0 → Godot 1:1.
- Blender modeling convention: characters face **−Y**, Z up.
- Exported with `export_yup=True` (glTF standard: +Y up, −Z forward). In Godot this maps directly to Godot's native convention (**+Y up, −Z forward**) — **no extra rotation needed**. Imported characters face −Z.
- All sockets exported with zero rotation, unit scale.

## 3. Character Dimensions (bounding boxes, rest pose)

| Class | Width (X) | Depth (Y) | Height (Z) |
|---|---|---|---|
| Captain | 0.98 m | 1.23 m | 1.88 m |
| Champion | 1.39 m | 1.41 m | 1.90 m |
| Guardian | 0.94 m | 0.86 m | 1.83 m |
| Striker | 0.90 m | 0.48 m | 1.83 m |
| Rift Guardian (boss) | 2.84 m | 1.20 m | 2.76 m |

Blue and red counterparts have **identical** dimensions. Use capsule collision ≈ 0.5 m radius × 1.8 m height for humanoids; ≈ 1.2 m radius × 2.6 m for the boss.

Arena layout: fortresses at **x = ±20 m** (40 m center-to-center), crown/capture at origin, capture radius **6.5 m**, playable strip 54 × 26 m.

## 4. Animations (all 30 FPS, frame ranges inclusive)

### Humanoid library (shared skeleton `RC_Rig_Humanoid_Master`, all 8 characters)
| Name | Frames | Purpose / sync notes |
|---|---|---|
| RC_ACT_Idle | 1–60 | Loop |
| RC_ACT_Walk | 1–30 | Loop |
| RC_ACT_Run | 1–21 | Loop |
| RC_ACT_RetreatRun | 1–21 | Loop, plays backwards-facing |
| RC_ACT_MeleeAttack | 1–24 | Champion strike / Guardian swing |
| RC_ACT_CannonFire | 1–24 | Captain — trigger muzzle flash ~f8–10 |
| RC_ACT_CrossbowFire | 1–24 | Striker — spawn projectile ~f10 |
| RC_ACT_ShieldBlock | 1–30 | Guardian raise/hold/lower |
| RC_ACT_HitReact | 1–15 | One-shot |
| RC_ACT_Death | 1–45 | One-shot, stays down at end |
| RC_ACT_Spawn | 1–24 | Fortress spawn entrance |
| RC_ACT_Celebrate | 1–60 | Victory loop |

### Boss library (`RC_Rig_RiftGuardian`, unique rig)
| Name | Frames | Purpose / sync notes |
|---|---|---|
| RC_ACT_BossIdle | 1–60 | Loop |
| RC_ACT_BossWalk | 1–30 | Loop |
| RC_ACT_BossMaceAttack | 1–30 | **Impact at frame 15** — spawn hit VFX/damage here |
| RC_ACT_BossGroundSlam | 1–36 | **Impact at frame 16** — spawn shockwave + camera shake; body sinks to z≈7.5 |
| RC_ACT_BossHitReact | 1–15 | One-shot |
| RC_ACT_BossSpawn | 1–36 | Rift emergence |
| RC_ACT_BossDeath | 1–45 | One-shot |

All animations start and end at exact rest pose (safe to loop/blend at boundaries).

## 5. Sockets (imported as empty Node3D nodes)

| Socket | Present on | Purpose |
|---|---|---|
| `RC_SOCKET_<Faction>_<Class>_Ground` | Humanoids (z = 0.00) | Ground anchor, spawn/arrival rings |
| `RC_SOCKET_<Faction>_<Class>_HealthBar` | Humanoids (z ≈ 2.08) | Health bar UI anchor |
| `RC_SOCKET_<Faction>_<Class>_HitCenter` | Humanoids (z ≈ 1.26) | Projectile/hit target point |
| `RC_SOCKET_Ground` | Boss (z = 0.00) | Ground anchor |
| `RC_SOCKET_HealthBar` | Boss (z = 3.25) | Boss health bar anchor |
| `RC_SOCKET_HitCenter` | Boss (z = 1.60) | Hit target |
| `RC_SOCKET_RiftCore` | Boss (z = 1.60) | Purple core glow / weak point |
| `RC_SOCKET_FortressHealthBar_Blue/Red` | Fortresses | Fortress HP bar anchor |
| `RC_SOCKET_FortressHitCenter_Blue/Red` | Fortresses | Fortress hit point |
| `RC_SOCKET_CaptureCenter` | Crown (0, 0, 0.6) | Capture zone center |
| `RC_SOCKET_Impact` | ProjectileGold | Impact VFX anchor |

Example humanoids: `RC_SOCKET_Blue_Captain_Ground`, `RC_SOCKET_Red_Striker_HealthBar`, etc.

## 6. Materials (canonical names; `.001`–`.003` copies are per-character duplicates)

- **Faction:** `RC_MAT_Blue_Primary`, `RC_MAT_Blue_Cloth`, `RC_MAT_Blue_Dark`, `RC_MAT_Red_Primary`, `RC_MAT_Red_Cloth`, `RC_MAT_Red_Dark`
- **Metals/organics:** `RC_MAT_Steel`, `RC_MAT_DarkSteel`, `RC_MAT_Gold_Trim`, `RC_MAT_Leather`, `RC_MAT_Wood`
- **Skin/hair/face:** `RC_MAT_Skin_Light`, `RC_MAT_Skin_Medium`, `RC_MAT_Skin_Dark`, `RC_MAT_Hair_Black`, `RC_MAT_Hair_Brown`, `RC_MAT_EyeWhite`, `RC_MAT_Iris_Blue`, `RC_MAT_Iris_Brown`
- **Boss:** `RC_MAT_BossStone`, `RC_MAT_BossPurpleCrystal`
- **Environment/objective:** `RC_MAT_FortressStone`, `RC_MAT_CrownGold`, `RC_MAT_Grass`, `RC_MAT_Dirt`
- **Emissive:** `RC_MAT_Glow_Blue`, `RC_MAT_Glow_Red`, `RC_MAT_Glow_Purple`, `RC_MAT_ProjectileGold`
- **Capture zone variants:** `RC_MAT_Zone_Neutral`, `RC_MAT_Zone_Blue`, `RC_MAT_Zone_Red`, `RC_MAT_Zone_Contested`

No image textures are used — all materials are flat-color Principled BSDF / emission. Recreate as `StandardMaterial3D` with albedo + emission values; dedupe the per-character `.00x` copies into shared resources on import.

## 7. LODs

- Blender contains `RC_<Asset>_LOD1` (Decimate ratio **0.55**, ~54% tris) and `RC_<Asset>_LOD2` (ratio **0.25**, ~25% tris) for all 8 humanoids, boss, and fortresses — 280 objects per level.
- **LOD meshes are NOT in the GLB exports** (LOD0 only). Either accept LOD0 everywhere (counts are low) or request separate LOD exports; switching can also be done via Godot `VisibilityRange` on duplicated imports.
- LOD0 triangle budgets: humanoids ~2–4k, boss 43,214, fortress 558, crown 168, arena 1,360, VFX < 500 each.

## 8. Collision Proxies (Blender-side only — not exported)

Create Godot `CollisionShape3D`/`StaticBody3D` from these dimensions instead:

| Proxy | Purpose |
|---|---|
| `RC_PROXY_Fortress` | Fortress static collider (5 × 4 × 5.9 m) |
| `RC_PROXY_Crown` | Crown objective collider (pedestal ~1.2 m) |
| `RC_PROXY_CaptainCannon_L/R` | Weapon hit volumes |
| `RC_PROXY_ChampionSword` | Weapon hit volume |
| `RC_PROXY_GuardianMace` / `RC_PROXY_GuardianShield` | Weapon/shield hit volumes |
| `RC_PROXY_StrikerCrossbow` | Weapon hit volume |

## 9. Recommended Godot Import Settings

- Import GLBs as **scenes** (default). Keep `import/gltf` defaults: skins import on, animations on.
- Animations land in an `AnimationLibrary` — names match §4 exactly; use `AnimationPlayer` + `AnimationTree` with blend spaces for Idle/Walk/Run.
- Set animation loop points per §4 (Godot imports in seconds; 30 FPS source).
- Sockets arrive as `Node3D` children of the skeleton/armature root — fetch with `find_child("RC_SOCKET_*", recursive=true)` (names may carry numeric suffixes after import; match by prefix).
- Emission materials: enable `emission_enabled` and raise `emission_energy` for Glow_* / CrownGold / ProjectileGold; add `WorldEnvironment` glow (bloom) for readability.
- Fortress/Crown/Arena: generate trimesh or primitive collision in Godot; meshes are intentionally low-poly.
- `RC_VFX_CaptureZone` sits +0.02 m above ground to avoid z-fighting — keep at that offset.

## 10. Lighting / Battle Stages (recreate in Godot)

| Stage | Direction |
|---|---|
| Day | Bright clear sky, warm stone, cool mountains, soft strong sun |
| Dusk | Orange-purple sunset, long shadows, glowing fortress entrances/crown |
| RiftCrisis | Purple storm sky, desaturated environment, purple rim light, boss at center, rift crack under crown |
| SuddenDeath | Red-orange storm, high contrast, energy lines converging on crown, no purple |

Reference renders: `game/assets/blender/renders/P11_Scene_*.png`.

## 11. Known Limitations

1. Boss GroundSlam fists stop at z ≈ 0.59 m above ground — sell the impact with the shockwave VFX + camera shake at frame 16.
2. LOD meshes are not exported (see §7).
3. Blue/Red character GLBs share identical mesh data blocks (exporter dedup) — node names are per-faction and correct; visually identical except faction materials.
4. Material `.00x` duplicates exist per character — consolidate to shared Godot resources.
5. Weapon-grip sockets (`RC_SOCKET_WeaponGrip_L/R`, `RC_SOCKET_Weapon_Root`) exist only in the Blender rig library and were not exported; weapons are already parented/skinned in place.
6. No textures; all flat-color materials (by design).
7. Lighting scenes not exported — recreate per §10.

## 12. VFX — Recreate with Godot Particles/Shaders

The Blender assets below are **art references / optional mesh emitters** (visible in the master blend, `RC_VFX_*`):

| Effect | Suggested Godot approach |
|---|---|
| Projectile impact burst (`RC_VFX_ProjectileImpactBurst`) | GPUParticles3D burst, gold billboard sprites |
| Cannon muzzle flash (`RC_VFX_CannonMuzzleFlash`) | One-shot particles + OmniLight3D flash |
| Crossbow muzzle flash (`RC_VFX_CrossbowMuzzleFlash`) | One-shot particles |
| Shield activation (`RC_VFX_ShieldActivation`) | Animated shader ring on shield |
| Guardian arrival ring (`RC_VFX_GuardianArrivalRing`) | Ground ring shader, expanding |
| Share shield bubble (`RC_VFX_ShieldBubble`) | Fresnel-shader sphere, alpha fade |
| Champion spawn flare (`RC_VFX_ChampionSpawnFlare`) | Vertical particle beam |
| Boss ground-slam shockwave (`RC_VFX_BossSlamShockwave`) | Expanding ground ring + debris particles, sync to frame 16 |
| Dominion gain pulse (`RC_VFX_DominionGainPulse`) | Pulse around crown, faction-colored |

Imported mesh VFX (`RC_VFX_ProjectileGold`, `RC_VFX_CaptureZone`) are usable directly but particles/shaders give better runtime control.

---

**Verification performed:** every GLB scanned at binary + glTF-JSON level for action contamination, socket presence, skinning, and hierarchy; character and boss libraries are fully isolated (12 humanoid / 7 boss actions). Master blend saved as `RiftCrowd_Master_P13_ExportReady.blend`.
