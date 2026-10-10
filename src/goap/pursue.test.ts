import { describe, expect, it, vi } from 'vitest';
import { pursueGoap, type GoapStep, type GoapWorldState } from './index.js';

/** A door that is locked until the key is taken, sensed afresh after each step. */
function room() {
    const world = { key: false, open: false, through: false, jams: 0 };
    const sense = async (): Promise<GoapWorldState> => ({
        key: world.key,
        open: world.open,
        through: world.through,
    });
    const steps: GoapStep<typeof world>[] = [
        {
            id: 'take-key',
            cost: 1,
            preconditions: { key: false },
            effects: { key: true },
            run: async (w) => {
                w.key = true;
            },
        },
        {
            id: 'open',
            cost: 1,
            preconditions: { key: true, open: false },
            effects: { open: true },
            // The first try jams: the door stays shut, and the pursuit must try again.
            run: async (w) => {
                if (w.jams++ > 0) w.open = true;
            },
        },
        {
            id: 'walk-through',
            cost: 1,
            preconditions: { open: true },
            effects: { through: true },
            run: async (w) => {
                w.through = true;
            },
        },
    ];
    return { world, sense, steps };
}

describe('pursueGoap', () => {
    it('plans from what it senses each step, and tries again when a step did nothing', async () => {
        const { world, sense, steps } = room();
        const onStep = vi.fn();
        const result = await pursueGoap({ through: true }, steps, sense, {
            context: world,
            maxSteps: 10,
            stallLimit: 3,
            onStep,
        });
        expect(result).toEqual({
            reached: true,
            steps: ['take-key', 'open', 'open', 'walk-through'],
            last: { key: true, open: true, through: true },
        });
        expect(onStep).toHaveBeenNthCalledWith(1, 'take-key', { key: false, open: false, through: false });
    });

    it('takes no step when the goal already holds', async () => {
        const { world, sense, steps } = room();
        world.through = true;
        const result = await pursueGoap({ through: true }, steps, sense, { context: world, maxSteps: 1, stallLimit: 1 });
        expect(result).toMatchObject({ reached: true, steps: [] });
    });

    it('stops when the world stops changing, and says so', async () => {
        const { world, sense, steps } = room();
        const stuck = steps.map((step) => (step.id === 'open' ? { ...step, run: async () => {} } : step));
        const result = await pursueGoap({ through: true }, stuck, sense, { context: world, maxSteps: 10, stallLimit: 2 });
        expect(result).toMatchObject({ reached: false, reason: 'stalled', steps: ['take-key', 'open', 'open'] });
    });

    it('stops when no plan reaches the goal', async () => {
        const { world, sense, steps } = room();
        const noKey = steps.filter((step) => step.id !== 'take-key');
        const result = await pursueGoap({ through: true }, noKey, sense, { context: world, maxSteps: 10, stallLimit: 2 });
        expect(result).toMatchObject({ reached: false, reason: 'no-plan', steps: [] });
    });

    it('stops at the step limit', async () => {
        const { world, sense, steps } = room();
        const result = await pursueGoap({ through: true }, steps, sense, { context: world, maxSteps: 2, stallLimit: 5 });
        expect(result).toMatchObject({ reached: false, reason: 'step-limit', steps: ['take-key', 'open'] });
    });

    it('stops between steps once aborted, never mid-step', async () => {
        const { world, sense, steps } = room();
        const abort = new AbortController();
        const aborting = steps.map((step) =>
            step.id === 'take-key'
                ? {
                      ...step,
                      run: async (w: typeof world) => {
                          abort.abort();
                          await step.run(w);
                      },
                  }
                : step,
        );
        const result = await pursueGoap({ through: true }, aborting, sense, {
            context: world,
            maxSteps: 10,
            stallLimit: 3,
            signal: abort.signal,
        });
        expect(result).toMatchObject({ reached: false, reason: 'aborted', steps: ['take-key'] });
        expect(world.key).toBe(true);
    });

    it('rejects with the error of a step that throws', async () => {
        const { world, sense, steps } = room();
        const broken = steps.map((step) =>
            step.id === 'take-key'
                ? {
                      ...step,
                      run: async () => {
                          throw new Error('dropped the key');
                      },
                  }
                : step,
        );
        await expect(
            pursueGoap({ through: true }, broken, sense, { context: world, maxSteps: 10, stallLimit: 3 }),
        ).rejects.toThrow('dropped the key');
    });

    it('refuses limits that are not positive integers', async () => {
        const { world, sense, steps } = room();
        await expect(
            pursueGoap({ through: true }, steps, sense, { context: world, maxSteps: 0, stallLimit: 1 }),
        ).rejects.toThrow(RangeError);
        await expect(
            pursueGoap({ through: true }, steps, sense, { context: world, maxSteps: 1, stallLimit: 1.5 }),
        ).rejects.toThrow(RangeError);
    });
});
