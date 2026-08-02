/**
 * Viewer module barrel export — Phase 7 viewer identity and faction participation.
 */
export { sanitizeDisplayName, createViewerProfile, ViewerProfileSchema, ContributionCategoriesSchema, DEFAULT_DISPLAY_NAME_MAX_LENGTH, } from './viewer_profile.js';
export { ViewerRegistry } from './viewer_registry.js';
export { CommandParser } from './command_parser.js';
export { ChampionSpawner } from './champion_spawner.js';
export { ContributionTracker, ALL_CATEGORIES } from './contribution_tracker.js';
