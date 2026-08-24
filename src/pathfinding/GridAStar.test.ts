import { describe, expect, it } from 'vitest';
import { astar } from './GridAStar.js';

describe('astar', () => {
    it('returns a single-cell path when start equals end', () => {
        const grid = [
            [0, 0],
            [0, 0],
        ];
        expect(astar(grid, 1, 1, 1, 1)).toEqual([[1, 1]]);
    });

    it('returns [] for an empty grid', () => {
        expect(astar([], 0, 0, 0, 0)).toEqual([]);
    });

    it('returns [] when the grid has rows but no columns', () => {
        expect(astar([[]], 0, 0, 0, 0)).toEqual([]);
    });

    it('returns [] when the start point is out of bounds', () => {
        const grid = [[0, 0], [0, 0]];
        expect(astar(grid, -1, 0, 1, 1)).toEqual([]);
        expect(astar(grid, 0, -1, 1, 1)).toEqual([]);
        expect(astar(grid, 2, 0, 1, 1)).toEqual([]);
        expect(astar(grid, 0, 2, 1, 1)).toEqual([]);
    });

    it('returns [] when the end point is out of bounds', () => {
        const grid = [[0, 0], [0, 0]];
        expect(astar(grid, 0, 0, -1, 0)).toEqual([]);
        expect(astar(grid, 0, 0, 0, -1)).toEqual([]);
        expect(astar(grid, 0, 0, 2, 0)).toEqual([]);
        expect(astar(grid, 0, 0, 0, 2)).toEqual([]);
    });

    it('returns [] when the target is walled off entirely', () => {
        const grid = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0],
        ];
        expect(astar(grid, 0, 0, 2, 2)).toEqual([]);
    });

    it('finds a straight path across an open grid', () => {
        const grid = [
            [0, 0, 0, 0],
        ];
        expect(astar(grid, 0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    });

    it('prefers a diagonal move when both orthogonal neighbours are open', () => {
        const grid = [
            [0, 0],
            [0, 0],
        ];
        const path = astar(grid, 0, 0, 1, 1);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([1, 1]);
        // A fully open 2x2 grid allows a single diagonal step.
        expect(path).toEqual([[0, 0], [1, 1]]);
    });

    it('does not cut a diagonal corner when either orthogonal neighbour is blocked', () => {
        // Blocking one orthogonal neighbour of the diagonal forces a longer route.
        const grid = [
            [0, 1],
            [0, 0],
        ];
        const path = astar(grid, 0, 0, 1, 1);
        expect(path).toEqual([[0, 0], [0, 1], [1, 1]]);
    });

    it('revisits a cheaper path to an already-open node (closed-set continue branch)', () => {
        // A grid with multiple routes to the same intermediate cell forces the
        // open set to re-pop a cell already marked closed at least once.
        const grid = [
            [0, 0, 0, 0, 0],
            [0, 1, 1, 1, 0],
            [0, 0, 0, 0, 0],
            [0, 1, 1, 1, 0],
            [0, 0, 0, 0, 0],
        ];
        const path = astar(grid, 0, 0, 4, 4);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([4, 4]);
        expect(path.length).toBeGreaterThan(1);
    });

    it('finds a path across a large open diagonal grid (heap right-child sink branch)', () => {
        // A large fully-open grid produces enough concurrent open-set entries
        // that the binary heap's sink-down must compare against both children,
        // including cases where the right child is the smaller one.
        const size = 12;
        const grid = Array.from({ length: size }, () => Array(size).fill(0));
        const path = astar(grid, 0, 0, size - 1, size - 1);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([size - 1, size - 1]);
    });

    it('reaches the goal on an irregular obstacle field that forces node re-expansion', () => {
        // A specific irregular obstacle layout (found by search) produces a
        // scenario where the open set pops a node already marked closed at
        // least once before the goal is reached — the exact continue-branch
        // scenario the simpler zigzag/branching grids above do not trigger.
        const grid = [
            [0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [1, 0, 1, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 1],
            [0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0],
        ];
        const path = astar(grid, 0, 0, 6, 6);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([6, 6]);
    });
});
