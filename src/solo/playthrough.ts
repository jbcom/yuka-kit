import type { ClassGovernor } from '../governors/ClassGovernor.js';
import type { GovernorDecision, GovernorObservation } from '../governors/types.js';
import type { SoloAICommand, SoloCommandAdapter } from './adapter.js';

export interface GovernedPlaythroughStep {
    index: number;
    decision: GovernorDecision;
    command?: SoloAICommand;
}

export interface GovernedPlaythroughReport {
    completed: boolean;
    reason: 'command-rejected' | 'complete' | 'max-steps' | 'stalled';
    steps: GovernedPlaythroughStep[];
    rejectedReason?: string;
}

export interface GovernedPlaythroughOptions {
    entityId: string;
    governor: ClassGovernor;
    adapter: SoloCommandAdapter;
    observe(): GovernorObservation | Promise<GovernorObservation>;
    advance(): void | Promise<void>;
    isComplete(observation: GovernorObservation): boolean;
    maxSteps?: number;
    stallLimit?: number;
    progressKey?: (observation: GovernorObservation) => string;
}

/**
 * Drive an end-to-end class run through the same Solo dispatch API as human
 * input. It never teleports or mutates runtime state; progress comes only from
 * accepted AI-source commands and the caller's normal game tick.
 */
export async function runGovernedPlaythrough(
    options: GovernedPlaythroughOptions,
): Promise<GovernedPlaythroughReport> {
    const maxSteps = Math.max(1, Math.floor(options.maxSteps ?? 10_000));
    const stallLimit = Math.max(1, Math.floor(options.stallLimit ?? 300));
    const steps: GovernedPlaythroughStep[] = [];
    let lastProgress: string | undefined;
    let stalled = 0;

    for (let index = 0; index < maxSteps; index += 1) {
        const observation = await options.observe();
        if (options.isComplete(observation)) return { completed: true, reason: 'complete', steps };

        if (options.progressKey) {
            const key = options.progressKey(observation);
            stalled = key === lastProgress ? stalled + 1 : 0;
            lastProgress = key;
            if (stalled >= stallLimit) return { completed: false, reason: 'stalled', steps };
        }

        const decision = options.governor.decide(observation);
        const outcome = options.adapter.dispatch(options.entityId, observation.actor.position, decision.intent);
        steps.push({ index, decision, command: outcome.command });
        if (outcome.result && !outcome.result.accepted) {
            return {
                completed: false,
                reason: 'command-rejected',
                steps,
                rejectedReason: outcome.result.reason,
            };
        }
        await options.advance();
    }

    const finalObservation = await options.observe();
    return options.isComplete(finalObservation)
        ? { completed: true, reason: 'complete', steps }
        : { completed: false, reason: 'max-steps', steps };
}

