import type { GameEntity, Goal } from 'yuka';
import { compareGoapIds, validateGoapAction, type GoapAction } from './planner.js';

/** A plannable action plus the Yuka goal that performs it. */
export interface GoapActionDefinition<Owner extends GameEntity = GameEntity> extends GoapAction {
    /** Build the Yuka goal that carries out this action for `owner`. */
    readonly createGoal: (owner: Owner) => Goal;
    /**
     * Optional procedural precondition checked when planning and again before
     * the step runs, for facts that do not belong in world state.
     */
    readonly isAvailable?: (owner: Owner) => boolean;
}

interface RegisteredAction<Owner extends GameEntity> {
    readonly definition: GoapActionDefinition<Owner>;
    readonly source: string;
}

const assertSource = (source: unknown): string => {
    if (typeof source !== 'string' || source.length === 0) {
        throw new TypeError('GOAP action source must be a non-empty string');
    }
    return source;
};

function validateDefinition<Owner extends GameEntity>(
    definition: GoapActionDefinition<Owner>,
): void {
    validateGoapAction(definition);
    if (typeof definition.createGoal !== 'function') {
        throw new TypeError(`GOAP action ${definition.id} createGoal must be a function`);
    }
    if (definition.isAvailable !== undefined && typeof definition.isAvailable !== 'function') {
        throw new TypeError(`GOAP action ${definition.id} isAvailable must be a function`);
    }
}

/**
 * An agent's actions, each tagged with the source that contributed it (for
 * example `'base'` or `'item:sun-staff'`), so equipment can add and remove
 * actions without touching the rest. Ids are unique across all sources.
 */
export class GoapActionRegistry<Owner extends GameEntity = GameEntity> {
    readonly #actions = new Map<string, RegisteredAction<Owner>>();

    /** Add one action. Returns a function that removes exactly this action. */
    register(definition: GoapActionDefinition<Owner>, source = 'base'): () => void {
        return this.contribute(source, [definition]);
    }

    /**
     * Add several actions from one source, all or nothing: a duplicate id or
     * invalid definition anywhere leaves the registry unchanged. Returns a
     * function that removes exactly these actions.
     */
    contribute(source: string, definitions: readonly GoapActionDefinition<Owner>[]): () => void {
        assertSource(source);
        if (!Array.isArray(definitions)) throw new TypeError('GOAP definitions must be an array');
        const incoming = new Set<string>();
        for (const definition of definitions) {
            validateDefinition(definition);
            if (this.#actions.has(definition.id) || incoming.has(definition.id)) {
                throw new TypeError(`Duplicate GOAP action id: ${definition.id}`);
            }
            incoming.add(definition.id);
        }
        for (const definition of definitions) {
            this.#actions.set(definition.id, { definition, source });
        }
        return () => {
            for (const definition of definitions) {
                if (this.#actions.get(definition.id)?.definition === definition) {
                    this.#actions.delete(definition.id);
                }
            }
        };
    }

    /** Remove every action contributed by `source`. Returns how many were removed. */
    revoke(source: string): number {
        assertSource(source);
        let removed = 0;
        for (const [id, entry] of this.#actions) {
            if (entry.source === source) {
                this.#actions.delete(id);
                removed += 1;
            }
        }
        return removed;
    }

    has(id: string): boolean {
        return this.#actions.has(id);
    }

    get(id: string): GoapActionDefinition<Owner> | undefined {
        return this.#actions.get(id)?.definition;
    }

    /** The source that contributed `id`, if registered. */
    sourceOf(id: string): string | undefined {
        return this.#actions.get(id)?.source;
    }

    get size(): number {
        return this.#actions.size;
    }

    /** Every registered action, in `id` order. */
    list(): GoapActionDefinition<Owner>[] {
        return [...this.#actions.values()]
            .map(({ definition }) => definition)
            .sort((left, right) => compareGoapIds(left.id, right.id));
    }

    /** The actions `owner` can plan with right now (`isAvailable` passes), in `id` order. */
    actionsFor(owner: Owner): GoapActionDefinition<Owner>[] {
        return this.list().filter((definition) => definition.isAvailable?.(owner) ?? true);
    }
}
