import { State, type Vehicle } from 'yuka';
/**
 * Dead state: marks the entity for cleanup.
 * No transitions out — the game should remove the entity.
 */
export class DeadState extends State {
    /** Set to true when enter() is called. Systems can check this flag. */
    markedForCleanup = false;
    enter(owner: Vehicle): void {
        owner.steering.clear();
        owner.active = false;
        this.markedForCleanup = true;
    }
    execute(): void {
        // No-op: dead entities do nothing.
    }
    exit(): void {
        // No-op: dead state has no exit behavior.
    }
}
