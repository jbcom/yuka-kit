import { afterEach, describe, expect, it, vi } from 'vitest';
import { AStar } from 'yuka';
import { findCandidateRoute } from './candidateRoute.js';

const point = (x: number, z = 0) => ({ x, y: 0, z });
afterEach(() => vi.restoreAllMocks());

describe('bounded physical candidate routes', () => {
    it('returns an exact checked direct route with one query and no actor mutation', () => {
        const from = point(0);
        const to = point(3.123);
        const canTravel = vi.fn(() => true);
        expect(findCandidateRoute({ from, to, candidates: [point(1, 1)], canTravel })).toEqual({
            status: 'found', waypoints: [from, to], distance: 3.123, pathQueries: 1, expandedNodes: 0,
        });
        expect(canTravel).toHaveBeenCalledOnce();
        expect(from).toEqual(point(0));
    });

    it('executes real Yuka AStar over checked directed legs without random or clocks', () => {
        vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random'); });
        vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock'); });
        const search = vi.spyOn(AStar.prototype, 'search');
        const canTravel = (from: { x: number }, to: { x: number }) => to.x === from.x + 1;
        const options = { from: point(0), to: point(3), candidates: [point(1), point(2)], canTravel };
        const route = findCandidateRoute(options);
        expect(search).toHaveBeenCalledOnce();
        expect(route.status).toBe('found');
        expect(route.waypoints).toEqual([point(0), point(1), point(2), point(3)]);
        expect(route.distance).toBe(3);
        expect(findCandidateRoute(options)).toEqual(route);
        expect(findCandidateRoute({ ...options, from: point(3), to: point(0) }).status).toBe('unreachable');
    });

    it('fails closed on candidate and query limits, including an incomplete adjacency expansion', () => {
        const canTravel = vi.fn(() => false);
        const options = { from: point(0), to: point(3), candidates: [point(1), point(2)], canTravel };
        expect(findCandidateRoute({ ...options, maxCandidates: 1 })).toMatchObject({ status: 'budget-exceeded', pathQueries: 0 });
        expect(canTravel).not.toHaveBeenCalled();
        expect(findCandidateRoute({ ...options, maxQueries: 2 })).toMatchObject({ status: 'budget-exceeded', waypoints: [], pathQueries: 2 });
        expect(findCandidateRoute(options)).toMatchObject({ status: 'unreachable', waypoints: [] });
    });

    it('can return a checked route after an unrelated outgoing branch exhausts the budget', () => {
        const options = { from: point(0), to: point(2), candidates: [point(1), point(9)], canTravel: (a: { x: number }, b: { x: number }) => b.x === a.x + 1, maxQueries: 6 };
        expect(findCandidateRoute(options)).toMatchObject({ status: 'found', waypoints: [point(0), point(1), point(2)], pathQueries: 6 });
    });

    it.each([-1, 0.5, 257, Number.NaN])('rejects invalid candidate budget %s', (maxCandidates) => {
        expect(() => findCandidateRoute({ from: point(0), to: point(1), candidates: [], canTravel: () => true, maxCandidates })).toThrow(RangeError);
    });
    it.each([0, 0.5, 65537, Number.NaN])('rejects invalid query budget %s', (maxQueries) => {
        expect(() => findCandidateRoute({ from: point(0), to: point(1), candidates: [], canTravel: () => true, maxQueries })).toThrow(RangeError);
    });
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])('rejects invalid coordinates %s', (x) => {
        expect(() => findCandidateRoute({ from: point(x), to: point(1), candidates: [], canTravel: () => true })).toThrow(TypeError);
    });
});
