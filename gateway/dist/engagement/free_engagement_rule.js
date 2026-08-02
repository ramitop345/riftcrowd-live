/**
 * Phase 12 — Free Engagement Rule.
 *
 * Implements CommandRule interface. Routes events to engagement subsystems:
 *   - like → LikeMilestoneAggregator
 *   - follow → FollowGuardian
 *   - share → ShareShield
 *   - chat with !strategy or !ability → StrategyVote or FreeEnergyAbility
 *   - director RESULTS stage → TopContributor
 *
 * Logs every decision at info level (transparent logs).
 */
// ---------------------------------------------------------------------------
// FreeEngagementRule class
// ---------------------------------------------------------------------------
export class FreeEngagementRule {
    name = 'FreeEngagementRule';
    spamFilter;
    likeAggregator;
    followGuardian;
    shareShield;
    strategyVote;
    freeEnergyAbility;
    topContributor;
    logFn;
    constructor(spamFilter, likeAggregator, followGuardian, shareShield, strategyVote, freeEnergyAbility, topContributor, logFn) {
        this.spamFilter = spamFilter;
        this.likeAggregator = likeAggregator;
        this.followGuardian = followGuardian;
        this.shareShield = shareShield;
        this.strategyVote = strategyVote;
        this.freeEnergyAbility = freeEnergyAbility;
        this.topContributor = topContributor;
        this.logFn = logFn ?? (() => { });
    }
    applies(event) {
        if (event.type === 'like' || event.type === 'follow' || event.type === 'share')
            return true;
        if (event.type === 'chat' && event.comment !== undefined) {
            const c = event.comment.trim();
            return c.startsWith('!strategy') || c.startsWith('!ability');
        }
        return false;
    }
    execute(event, _context) {
        const nowMs = Date.now();
        const commands = [];
        // Apply spam filter to chat events
        if (event.type === 'chat' && event.comment) {
            if (!this.spamFilter.allow(event.user.id, nowMs)) {
                const log = `Chat from ${event.user.id} → spam filter blocked`;
                this.logFn(`[FreeEngagement] ${log}`);
                return null;
            }
        }
        // Route by event type
        if (event.type === 'like') {
            const decisions = this.likeAggregator.processLike(event);
            for (const decision of decisions) {
                commands.push(decision.command);
                this.topContributor.record(event.user.id, 'like');
            }
            return commands.length > 0 ? commands : null;
        }
        if (event.type === 'follow') {
            const decision = this.followGuardian.processFollow(event, nowMs);
            if (decision.command) {
                commands.push(decision.command);
                this.topContributor.record(event.user.id, 'follow');
            }
            return commands.length > 0 ? commands : null;
        }
        if (event.type === 'share') {
            const decision = this.shareShield.processShare(event, nowMs);
            if (decision.command) {
                commands.push(decision.command);
                this.topContributor.record(event.user.id, 'share');
            }
            return commands.length > 0 ? commands : null;
        }
        if (event.type === 'chat' && event.comment) {
            const comment = event.comment.trim();
            // Check for !strategy <option>
            if (comment.startsWith('!strategy ')) {
                const option = comment.slice(10).trim();
                const decision = this.strategyVote.processVote(event, option, nowMs);
                if (decision && decision.command) {
                    commands.push(decision.command);
                    this.topContributor.record(event.user.id, 'vote');
                }
                return commands.length > 0 ? commands : null;
            }
            // Check for !ability
            if (comment === '!ability' || comment.startsWith('!ability ')) {
                const decision = this.freeEnergyAbility.processAbility(event, nowMs);
                if (decision.command) {
                    commands.push(decision.command);
                    this.topContributor.record(event.user.id, 'ability');
                }
                return commands.length > 0 ? commands : null;
            }
        }
        return null;
    }
    /**
     * Called at round end (RESULTS stage) to emit top contributor spotlight.
     */
    getTopContributorCommand() {
        const decision = this.topContributor.getTopContributorAtRoundEnd();
        if (decision) {
            this.logFn(`[FreeEngagement] ${decision.log}`);
            return decision.command;
        }
        return null;
    }
    /** Resets all subsystem state for a new round. */
    resetRound() {
        this.spamFilter.reset();
        this.likeAggregator.reset();
        this.followGuardian.reset();
        this.shareShield.reset();
        this.strategyVote.reset();
        this.freeEnergyAbility.reset();
        this.topContributor.reset();
    }
    /** Returns all subsystems for stats and testing. */
    getSubsystems() {
        return {
            spamFilter: this.spamFilter,
            likeAggregator: this.likeAggregator,
            followGuardian: this.followGuardian,
            shareShield: this.shareShield,
            strategyVote: this.strategyVote,
            freeEnergyAbility: this.freeEnergyAbility,
            topContributor: this.topContributor,
        };
    }
}
