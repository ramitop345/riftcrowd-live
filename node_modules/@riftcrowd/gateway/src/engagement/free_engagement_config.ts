/**
 * Phase 12 — Free Engagement Configuration Schema.
 *
 * Validates gateway/config/free_engagement.json: like milestones, follow guardians,
 * share shields, strategy votes, free-energy abilities, spam filter, top contributor, bounds.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Like milestone reward
// ---------------------------------------------------------------------------

export const LikeMilestoneRewardSchema = z
  .object({
    type: z.enum(['add_energy', 'add_score']),
    magnitude: z.number().finite().min(0),
  })
  .strict();

export type LikeMilestoneReward = z.infer<typeof LikeMilestoneRewardSchema>;

// ---------------------------------------------------------------------------
// Like milestone
// ---------------------------------------------------------------------------

export const LikeMilestoneSchema = z
  .object({
    count: z.number().int().min(1),
    reward: LikeMilestoneRewardSchema,
  })
  .strict();

export type LikeMilestone = z.infer<typeof LikeMilestoneSchema>;

// ---------------------------------------------------------------------------
// Follow guardian
// ---------------------------------------------------------------------------

export const FollowGuardianConfigSchema = z
  .object({
    enabled: z.boolean(),
    durationMs: z.number().int().min(0),
    cooldownMs: z.number().int().min(0),
    championType: z.string().min(1).max(64),
  })
  .strict();

export type FollowGuardianConfig = z.infer<typeof FollowGuardianConfigSchema>;

// ---------------------------------------------------------------------------
// Share shield
// ---------------------------------------------------------------------------

export const ShareShieldConfigSchema = z
  .object({
    enabled: z.boolean(),
    durationMs: z.number().int().min(0),
    cooldownMs: z.number().int().min(0),
    magnitude: z.number().finite().min(0),
  })
  .strict();

export type ShareShieldConfig = z.infer<typeof ShareShieldConfigSchema>;

// ---------------------------------------------------------------------------
// Strategy vote
// ---------------------------------------------------------------------------

export const StrategyVoteConfigSchema = z
  .object({
    windowMs: z.number().int().min(0),
    minVotes: z.number().int().min(1),
    options: z.array(z.string().min(1).max(64)).min(1),
  })
  .strict();

export type StrategyVoteConfig = z.infer<typeof StrategyVoteConfigSchema>;

// ---------------------------------------------------------------------------
// Free energy ability
// ---------------------------------------------------------------------------

export const FreeEnergyAbilityConfigSchema = z
  .object({
    cooldownMs: z.number().int().min(0),
    magnitude: z.number().finite().min(0),
    maxPerViewerPerRound: z.number().int().min(1),
  })
  .strict();

export type FreeEnergyAbilityConfig = z.infer<typeof FreeEnergyAbilityConfigSchema>;

// ---------------------------------------------------------------------------
// Spam filter
// ---------------------------------------------------------------------------

export const SpamConfigSchema = z
  .object({
    maxCommentsPerWindowMs: z.number().int().min(1),
    windowMs: z.number().int().min(0),
    duplicateVoteWindowMs: z.number().int().min(0),
  })
  .strict();

export type SpamConfig = z.infer<typeof SpamConfigSchema>;

// ---------------------------------------------------------------------------
// Top contributor
// ---------------------------------------------------------------------------

export const TopContributorConfigSchema = z
  .object({
    enabled: z.boolean(),
    rewardType: z.enum(['add_score', 'spotlight']),
    magnitude: z.number().finite().min(0),
  })
  .strict();

export type TopContributorConfig = z.infer<typeof TopContributorConfigSchema>;

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const FreeEngagementBoundsSchema = z
  .object({
    maxActiveGuardiansPerFaction: z.number().int().min(1),
    maxActiveShieldsPerFaction: z.number().int().min(1),
  })
  .strict();

export type FreeEngagementBounds = z.infer<typeof FreeEngagementBoundsSchema>;

// ---------------------------------------------------------------------------
// Full config
// ---------------------------------------------------------------------------

export const FreeEngagementConfigSchema = z
  .object({
    likeMilestones: z.array(LikeMilestoneSchema).min(1),
    followGuardian: FollowGuardianConfigSchema,
    shareShield: ShareShieldConfigSchema,
    strategyVote: StrategyVoteConfigSchema,
    freeEnergyAbility: FreeEnergyAbilityConfigSchema,
    spam: SpamConfigSchema,
    topContributor: TopContributorConfigSchema,
    bounds: FreeEngagementBoundsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    for (let i = 1; i < data.likeMilestones.length; i++) {
      if (data.likeMilestones[i]!.count <= data.likeMilestones[i - 1]!.count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['likeMilestones', i, 'count'],
          message: `Milestone ${i} count (${data.likeMilestones[i]!.count}) must be greater than milestone ${i - 1} count (${data.likeMilestones[i - 1]!.count})`,
        });
      }
    }
  });

export type FreeEngagementConfig = z.infer<typeof FreeEngagementConfigSchema>;
