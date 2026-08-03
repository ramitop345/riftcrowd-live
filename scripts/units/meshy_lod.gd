## MeshyLod — helper for Meshy-exported environment GLBs.
##
## Meshy env assets are exported with distance tiers baked in as sibling
## meshes: `env_<name>` (LOD0), `env_<name>_LOD1`, `env_<name>_LOD2`
## (and `_LOD3` for the projectile). Godot instantiates every tier at once,
## so only the selected tier may stay visible — the rest are hidden to avoid
## stacked/double rendering.
##
## Tier selection is config-driven (config/gameplay.json -> meshy.lodTier):
##   0 = full quality, 1 = ~50%, 2 = ~25%, 3 = ~12.5% (projectile only).
## If the requested tier is absent the highest available tier is used.
##
## Consumers preload this script (no class_name) so resolution does not depend
## on the editor's global script-class cache being up to date.
extends RefCounted

## Shows only the mesh matching `tier` inside an instantiated GLB root and
## hides every other `_LOD#` sibling. Returns the number of meshes kept visible.
static func apply(root: Node, tier: int) -> int:
	if root == null:
		return 0
	var suffix: String = "" if tier <= 0 else "_LOD%d" % tier
	var kept: int = 0
	var fallback: MeshInstance3D = null
	var meshes: Array = []
	_collect_meshes(root, meshes)
	# First pass: hide any LOD-suffixed mesh that is not the requested tier.
	for node: Variant in meshes:
		var mi: MeshInstance3D = node
		var nm: String = mi.name
		if nm.ends_with("_LOD1") or nm.ends_with("_LOD2") or nm.ends_with("_LOD3"):
			if nm.ends_with(suffix):
				mi.visible = true
				kept += 1
			else:
				mi.visible = false
		else:
			# Base (LOD0) mesh.
			if suffix == "":
				mi.visible = true
				kept += 1
			else:
				mi.visible = false
				if fallback == null:
					fallback = mi
	# If the requested tier was missing, fall back to the base mesh so the
	# asset still renders instead of disappearing.
	if kept == 0 and fallback != null:
		fallback.visible = true
		kept = 1
	return kept


## Recursively gathers every MeshInstance3D under `node`.
static func _collect_meshes(node: Node, out: Array) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			out.append(child)
		_collect_meshes(child, out)
