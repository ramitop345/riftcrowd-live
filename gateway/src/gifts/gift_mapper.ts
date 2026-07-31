/**
 * Phase 11 — GiftMapper.
 *
 * Resolves a raw gift event (giftId, count, viewerId, factionId) to a GiftImpact record.
 * Handles unknown gift IDs (log warn, return null).
 * Provides previewMappings() for dashboard.
 */

import type {
  GiftEconomyConfig,
  GiftTier,
  GiftMapping,
  GiftImpactType,
} from './gift_config.js';

// ---------------------------------------------------------------------------
// GiftImpact result
// ---------------------------------------------------------------------------

export interface GiftImpact {
  tierId: string;
  tierName: string;
  impactType: GiftImpactType;
  magnitude: number;
  duration?: number;
  cinematic?: boolean;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Mapping preview row
// ---------------------------------------------------------------------------

export interface MappingPreviewRow {
  giftId: string;
  displayName?: string;
  tierId: string;
  tierName: string;
  impactType: GiftImpactType;
  magnitude: number;
}

// ---------------------------------------------------------------------------
// GiftMapper class
// ---------------------------------------------------------------------------

export class GiftMapper {
  private readonly config: GiftEconomyConfig;
  private readonly tierMap: Map<string, GiftTier>;
  private readonly mappingMap: Map<string, GiftMapping>;
  private readonly warnings: string[] = [];

  constructor(config: GiftEconomyConfig) {
    this.config = config;
    this.tierMap = new Map(config.tiers.map((t) => [t.id, t]));
    this.mappingMap = new Map(config.mappings.map((m) => [m.giftId, m]));
  }

  /**
   * Resolves a gift to its impact. Returns null for unknown gifts (logs warning).
   * @param giftId — the gift identifier from the event
   * @param count — repeat count (scales magnitude)
   */
  resolve(giftId: string, count: number = 1): GiftImpact | null {
    if (!giftId || typeof giftId !== 'string') {
      this.warnings.push(`Malformed gift: missing or invalid giftId`);
      return null;
    }

    const mapping = this.mappingMap.get(giftId);
    if (!mapping) {
      this.warnings.push(`Unknown gift ID: ${giftId}`);
      return null;
    }

    const tier = this.tierMap.get(mapping.tierId);
    if (!tier) {
      this.warnings.push(`Gift ${giftId} references unknown tier: ${mapping.tierId}`);
      return null;
    }

    const baseMagnitude = tier.impact.magnitude;
    const scaledMagnitude = baseMagnitude * Math.max(1, count);

    return {
      tierId: tier.id,
      tierName: tier.name,
      impactType: tier.impact.type,
      magnitude: scaledMagnitude,
      duration: tier.impact.duration,
      cinematic: tier.impact.cinematic,
      displayName: mapping.displayName,
    };
  }

  /**
   * Returns a table of all giftId → tier → impact mappings.
   * Used by dashboard preview.
   */
  previewMappings(): MappingPreviewRow[] {
    const rows: MappingPreviewRow[] = [];
    for (const mapping of this.config.mappings) {
      const tier = this.tierMap.get(mapping.tierId);
      if (!tier) continue;
      rows.push({
        giftId: mapping.giftId,
        displayName: mapping.displayName,
        tierId: tier.id,
        tierName: tier.name,
        impactType: tier.impact.type,
        magnitude: tier.impact.magnitude,
      });
    }
    return rows;
  }

  /** Returns and clears accumulated warnings. */
  drainWarnings(): string[] {
    const w = [...this.warnings];
    this.warnings.length = 0;
    return w;
  }
}
