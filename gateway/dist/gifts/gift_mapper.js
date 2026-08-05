/**
 * Phase 11 — GiftMapper.
 *
 * Resolves a raw gift event (giftId, count, viewerId, factionId) to a GiftImpact record.
 * Handles unknown gift IDs (log warn, return null).
 * Provides previewMappings() for dashboard.
 */
// ---------------------------------------------------------------------------
// GiftMapper class
// ---------------------------------------------------------------------------
export class GiftMapper {
    config;
    tierMap;
    mappingMap;
    warnings = [];
    constructor(config) {
        this.config = config;
        this.tierMap = new Map(config.tiers.map((t) => [t.id, t]));
        this.mappingMap = new Map(config.mappings.map((m) => [m.giftId, m]));
    }
    /**
     * Resolves a gift to its impact. Returns null for unknown gifts (logs warning).
     * @param giftId — the gift identifier from the event
     * @param count — repeat count (scales magnitude)
     */
    resolve(giftId, count = 1) {
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
            techniqueTier: tier.technique?.magnitude,
            techniqueCinematic: tier.technique?.cinematic,
        };
    }
    /**
     * Returns a table of all giftId → tier → impact mappings.
     * Used by dashboard preview.
     */
    previewMappings() {
        const rows = [];
        for (const mapping of this.config.mappings) {
            const tier = this.tierMap.get(mapping.tierId);
            if (!tier)
                continue;
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
    drainWarnings() {
        const w = [...this.warnings];
        this.warnings.length = 0;
        return w;
    }
}
