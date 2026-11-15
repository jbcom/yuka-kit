import { AStar, Graph, NavEdge, NavNode, Vector3 } from 'yuka';
import type { Vec3Like } from '../core/types.js';

export interface CandidateRouteOptions {
    readonly from: Vec3Like;
    readonly to: Vec3Like;
    /** Ordered physical detour points. Order resolves equal-cost route ties. */
    readonly candidates: readonly Vec3Like[];
    /** Must validate the entire directed leg, including support and actor extent. */
    readonly canTravel: (from: Readonly<Vec3Like>, to: Readonly<Vec3Like>) => boolean;
    readonly maxCandidates?: number;
    readonly maxQueries?: number;
}

export interface CandidateRouteResult {
    readonly status: 'found' | 'unreachable' | 'budget-exceeded';
    /** Start and exact destination included. Empty unless status is found. */
    readonly waypoints: readonly Readonly<Vec3Like>[];
    readonly distance: number;
    readonly pathQueries: number;
    readonly expandedNodes: number;
}

/**
 * A bounded, command-neutral Yuka graph search. The caller owns physical candidate generation
 * and clearance; this helper never moves an actor, retains a plan or accepts an unchecked leg.
 * Adjacency is lazy so open scenes and a single obstruction do not pay for a complete graph.
 */
export function findCandidateRoute(options: CandidateRouteOptions): CandidateRouteResult {
    const maxCandidates = options.maxCandidates ?? 64;
    const maxQueries = options.maxQueries ?? 4096;
    if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 0 || maxCandidates > 256)
        throw new RangeError('maxCandidates must be an integer from 0 to 256');
    if (!Number.isSafeInteger(maxQueries) || maxQueries < 1 || maxQueries > 65536)
        throw new RangeError('maxQueries must be an integer from 1 to 65536');
    if (options.candidates.length > maxCandidates)
        return { status: 'budget-exceeded', waypoints: [], distance: 0, pathQueries: 0, expandedNodes: 0 };
    const points = [options.from, options.to, ...options.candidates].map((point) => {
        if (![point.x, point.y, point.z].every((value) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER))
            throw new TypeError('route coordinates must be finite and within the safe integer magnitude');
        return Object.freeze({ x: point.x, y: point.y, z: point.z });
    });
    let pathQueries = 0;
    let expandedNodes = 0;
    let exhausted = false;
    const result = (status: CandidateRouteResult['status'], indexes: number[] = []): CandidateRouteResult => {
        const waypoints = indexes.map((index) => points[index]);
        let distance = 0;
        for (let index = 1; index < waypoints.length; index += 1) {
            const a = waypoints[index - 1];
            const b = waypoints[index];
            distance += Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
        }
        return { status, waypoints, distance, pathQueries, expandedNodes };
    };
    pathQueries += 1;
    if (options.canTravel(points[0], points[1])) return result('found', [0, 1]);
    class PhysicalGraph extends Graph {
        private readonly adjacency = new Map<number, NavEdge[]>();

        override getEdgesOfNode(index: number, edges: NavEdge[]): NavEdge[] {
            edges.length = 0;
            let outgoing = this.adjacency.get(index);
            if (outgoing === undefined) {
                outgoing = [];
                expandedNodes += 1;
                for (let target = 0; target < points.length; target += 1) {
                    if (target === index) continue;
                    if (pathQueries >= maxQueries) {
                        exhausted = true;
                        break;
                    }
                    pathQueries += 1;
                    const from = points[index];
                    const to = points[target];
                    if (options.canTravel(from, to)) {
                        const dx = to.x - from.x;
                        const dy = to.y - from.y;
                        const dz = to.z - from.z;
                        outgoing.push(new NavEdge(index, target, Math.sqrt(dx * dx + dy * dy + dz * dz)));
                    }
                }
                this.adjacency.set(index, outgoing);
            }
            edges.push(...outgoing);
            return edges;
        }
    }
    const graph = new PhysicalGraph();
    graph.digraph = true;
    points.forEach((point, index) => graph.addNode(new NavNode(index, new Vector3(point.x, point.y, point.z))));
    const search = new AStar(graph, 0, 1).search();
    // A discovered route always consists of checked legs, even if another branch exhausted its budget.
    if (search.found) return result('found', search.getPath());
    return result(exhausted ? 'budget-exceeded' : 'unreachable');
}
