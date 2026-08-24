import { describe, expect, it } from 'vitest';
import { FollowPathBehavior, OnPathBehavior, Vehicle } from 'yuka';
import { followWaypoints } from './pathFollow.js';

const waypoints = [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
];

describe('followWaypoints', () => {
    it('builds a Path from the given waypoints and attaches follow + onPath behaviors', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints);
        expect(handle.follow).toBeInstanceOf(FollowPathBehavior);
        expect(handle.onPath).toBeInstanceOf(OnPathBehavior);
        expect(vehicle.steering.behaviors).toContain(handle.follow);
        expect(vehicle.steering.behaviors).toContain(handle.onPath);
        expect(handle.path.loop).toBe(false);
    });

    it('honors a custom nextWaypointDistance', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { nextWaypointDistance: 1.5 });
        expect(handle.follow.nextWaypointDistance).toBe(1.5);
    });

    it('honors loop:true', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { loop: true });
        expect(handle.path.loop).toBe(true);
    });

    it('honors custom pathRadius and predictionFactor on the OnPathBehavior', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { pathRadius: 2, predictionFactor: 3 });
        expect(handle.onPath?.radius).toBe(2);
        expect(handle.onPath?.predictionFactor).toBe(3);
    });

    it('sets a custom onPathWeight on the OnPathBehavior', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { onPathWeight: 0.5 });
        expect(handle.onPath?.weight).toBe(0.5);
    });

    it('omits the OnPathBehavior entirely when onPathWeight is 0', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { onPathWeight: 0 });
        expect(handle.onPath).toBeNull();
        expect(vehicle.steering.behaviors).toContain(handle.follow);
        expect(vehicle.steering.behaviors).not.toContainEqual(expect.any(OnPathBehavior));
    });

    it('clear() removes only the follow behavior when onPath was never attached', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints, { onPathWeight: 0 });
        expect(() => handle.clear()).not.toThrow();
        expect(vehicle.steering.behaviors).not.toContain(handle.follow);
    });

    it('clear() removes both follow and onPath behaviors when onPath was attached', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints);
        handle.clear();
        expect(vehicle.steering.behaviors).not.toContain(handle.follow);
        expect(vehicle.steering.behaviors).not.toContain(handle.onPath);
    });

    it('finished() reflects the underlying Path.finished() state', () => {
        const vehicle = new Vehicle();
        const handle = followWaypoints(vehicle, waypoints);
        expect(typeof handle.finished()).toBe('boolean');
    });
});
