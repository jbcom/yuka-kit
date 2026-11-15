import { describe, expect, it, vi } from 'vitest';
import * as upstream from 'yuka';
import { ConvexHull, Polyhedron, SAT, Vector3 } from './index.js';

const box = (min: number, max: number, offset = 0): ConvexHull => {
    const points: Vector3[] = [];
    for (const x of [min, max]) for (const y of [min, max]) for (const z of [min, max]) {
        points.push(new Vector3(x + offset, y, z));
    }
    return new ConvexHull().fromPoints(points);
};

describe('public upstream convex geometry', () => {
    it('exports the actual Yuka classes', () => {
        expect(ConvexHull).toBe(upstream.ConvexHull);
        expect(Polyhedron).toBe(upstream.Polyhedron);
        expect(SAT).toBe(upstream.SAT);
        expect(Vector3).toBe(upstream.Vector3);
    });

    it.each([
        ['separated', 3, false],
        ['overlapping', 1, true],
        ['face touching', 2, true],
    ] as const)('tests %s closed solids in both directions', (_, offset, expected) => {
        const a = box(-1, 1);
        const b = box(-1, 1, offset);
        for (const [first, second] of [[a, b], [b, a]]) {
            expect(first.intersectsConvexHull(second)).toBe(expected);
            expect(new SAT().intersects(first, second)).toBe(expected);
        }
    });

    it('includes full containment without boundary crossing', () => {
        const outer = box(-2, 2);
        const inner = box(-0.5, 0.5);
        expect(outer.intersectsConvexHull(inner)).toBe(true);
        expect(inner.intersectsConvexHull(outer)).toBe(true);
        expect(new SAT().intersects(outer, inner)).toBe(true);
        expect(new SAT().intersects(inner, outer)).toBe(true);
        for (const point of inner.vertices) expect(outer.containsPoint(point)).toBe(true);
    });

    it('builds a finite, outward-facing, closed box with nonzero volume', () => {
        const hull = box(-1, 1);
        expect(hull).toBeInstanceOf(Polyhedron);
        expect(hull.faces).toHaveLength(6);
        expect(hull.edges).toHaveLength(12);
        expect(hull.vertices).toHaveLength(8);
        let signedVolume = 0;
        for (const face of hull.faces) {
            expect(Number.isFinite(face.plane.constant)).toBe(true);
            expect(face.plane.normal.length()).toBeCloseTo(1);
            expect(face.distanceToPoint(hull.centroid)).toBeLessThan(0);
            const contour = face.getContour([]);
            expect(contour).toHaveLength(4);
            let edge = face.edge!;
            for (let i = 0; i < contour.length; i++) {
                expect(edge.polygon).toBe(face);
                expect(edge.next!.prev).toBe(edge);
                expect(edge.twin!.twin).toBe(edge);
                expect(edge.twin!.vertex).toBe(edge.prev!.vertex);
                expect(edge.twin!.prev!.vertex).toBe(edge.vertex);
                expect(edge.length()).toBeGreaterThan(0);
                edge = edge.next!;
            }
            expect(edge).toBe(face.edge);
            const a = contour[0];
            for (let i = 1; i < contour.length - 1; i++) {
                const b = contour[i];
                const c = contour[i + 1];
                signedVolume += (a.x * (b.y * c.z - b.z * c.y)
                    + a.y * (b.z * c.x - b.x * c.z)
                    + a.z * (b.x * c.y - b.y * c.x)) / 6;
            }
        }
        expect(signedVolume).toBeCloseTo(8);
        for (const point of hull.vertices) {
            expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
            for (const face of hull.faces) expect(face.distanceToPoint(point)).toBeLessThanOrEqual(1e-12);
        }
    });

    it('preserves upstream rejection behavior rather than treating invalid input as separation', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const unbuilt = new ConvexHull().fromPoints([new Vector3()]);
            expect(error).toHaveBeenCalled();
            expect(unbuilt.faces).toHaveLength(0);
            expect(unbuilt.vertices).toHaveLength(0);
        } finally {
            error.mockRestore();
        }
        expect(() => new ConvexHull().fromPoints([
            new Vector3(0, 0, 0), new Vector3(1, 0, 0),
            new Vector3(0, 1, 0), new Vector3(1, 1, 0),
        ])).toThrow();
    });
});
