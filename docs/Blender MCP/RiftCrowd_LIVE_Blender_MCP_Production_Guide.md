# RiftCrowd LIVE -- Blender MCP Production Guide

## Goal

Build the entire art pipeline using **reusable modular assets** instead
of creating every character from scratch.

## Asset Pipeline

1.  Create one master humanoid base mesh.
2.  Create a modular armor kit:
    -   Helmet
    -   Shoulders
    -   Chest
    -   Gloves
    -   Boots
    -   Cape
3.  Create a material library:
    -   Blue
    -   Red
    -   Gold
    -   Steel
    -   Leather
4.  Create a weapon library:
    -   Sword
    -   Hammer
    -   Crossbow
    -   Cannon
    -   Shield
5.  Create one humanoid rig.
6.  Create shared animations:
    -   Idle
    -   Walk
    -   Run
    -   Attack
    -   Hit
    -   Death
    -   Celebrate

## Blender MCP Prompt Sequence

### Phase 1 -- Master Humanoid

Create a stylized humanoid suitable for a competitive top-down action
game.

Requirements: - Heroic proportions - Clean quad topology - Separate
eyes - Separate teeth - Hands with five fingers - Feet - UV unwrap -
Target under 20k triangles

### Phase 2 -- Armor Kit

Create modular armor pieces that fit the master humanoid.

Requirements: - Helmet - Shoulder pads - Chest armor - Gloves - Boots -
Cape

Each piece must be a separate object.

### Phase 3 -- Material Library

Create reusable PBR materials:

-   Blue faction
-   Red faction
-   Gold trim
-   Steel
-   Leather

### Phase 4 -- Weapon Library

Create: - Sword - Hammer - Crossbow - Cannon - Shield

All should share the same stylized visual language.

### Phase 5 -- Rig

Create a humanoid armature with: - IK arms - IK legs - Spine - Neck -
Head - Fingers

Auto-weight and validate deformation.

### Phase 6 -- Animation Library

Create: - Idle - Walk - Run - Attack - Hit - Death - Celebrate

Loop where appropriate.

## Character Variants

Assemble the modular assets into:

-   Blue Captain
-   Red Captain
-   Blue Champion
-   Red Champion
-   Blue Guardian
-   Red Guardian
-   Blue Striker
-   Red Striker

Do not duplicate geometry unnecessarily---reuse meshes and materials
whenever possible.

## Boss

Create the Rift Guardian: - Massive stone body - Purple crystal core -
Heavy hammer - Separate glowing crystal materials - Reuse humanoid rig
where practical

## Environment

Create: - Blue Fortress - Red Fortress - Crown Objective - Capture
Zone - Projectile - Projectile impact VFX

Arena variants: - Day - Dusk - Rift Crisis - Sudden Death

## Export

Export all assets as `.glb` with: - Materials - UVs - Animations -
Consistent naming - Correct scale for Godot

## Validation Prompt

Before finishing any phase:

-   Check naming.
-   Check transforms.
-   Check UVs.
-   Check normals.
-   Check materials.
-   Check rig.
-   Report problems before modifying anything.
