/**
 * Waypoint path-following helpers (from voxel-realms' yuka-agent golden-path
 * runner, reduced to the reusable core: Path + FollowPathBehavior +
 * OnPathBehavior wiring with its tuned defaults).
 */
import { FollowPathBehavior, OnPathBehavior, Path, Vector3 } from 'yuka';
import type { Vehicle } from 'yuka';
import type { Vec3Like } from '../core/types.js';

export interface PathFollowOptions {
    nextWaypointDistance?: number;
    pathRadius?: number;
    predictionFactor?: number;
    loop?: boolean;
    onPathWeight?: number;
}

export interface PathFollowHandle {
    path: Path;
    follow: FollowPathBehavior;
    onPath: OnPathBehavior | null;
    finished(): boolean;
    clear(): void;
}
/**
 * Build a yuka Path from waypoints and attach follow + stay-on-path steering
 * to the vehicle. Returns a handle for querying progress and detaching.
 */
export function followWaypoints(
    vehicle: Vehicle,
    waypoints: readonly Vec3Like[],
    options: PathFollowOptions = {},
): PathFollowHandle {
    const path = new Path();
    path.loop = options.loop ?? false;
    for (const wp of waypoints) {
        path.add(new Vector3(wp.x, wp.y, wp.z));
    }
    const follow = new FollowPathBehavior(path, options.nextWaypointDistance ?? 0.45);
    vehicle.steering.add(follow);
    let onPath = null;
    const onPathWeight = options.onPathWeight ?? 1;
    if (onPathWeight > 0) {
        onPath = new OnPathBehavior(path, options.pathRadius ?? 0.75, options.predictionFactor ?? 1.4);
        onPath.weight = onPathWeight;
        vehicle.steering.add(onPath);
    }
    return {
        path,
        follow,
        onPath,
        finished: () => path.finished(),
        clear: () => {
            vehicle.steering.remove(follow);
            if (onPath)
                vehicle.steering.remove(onPath);
        },
    };
}
