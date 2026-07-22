/**
 * Grid A* pathfinding with octile distance heuristic and binary min-heap
 * open set (from goats-in-hell — 3-5x faster than BFS on large grids).
 * yuka ships no first-class pathfinder for arbitrary grids; this fills that
 * gap. Interface: grid[y][x] === 0 means walkable. Inherently 2D — usable
 * standalone by both 2D and 3D (XZ-plane) games.
 *
 * Returns an array of [x, y] grid cells from start (inclusive) to end (inclusive).
 * Returns [] when no path exists or inputs are out of bounds.
 */
interface HeapNode {
    f: number;
    x: number;
    y: number;
}

class MinHeap {
    data: HeapNode[] = [];
    push(node: HeapNode): void {
        this.data.push(node);
        this.bubbleUp(this.data.length - 1);
    }
    pop(): HeapNode | undefined {
        if (this.data.length === 0)
            return undefined;
        const top = this.data[0];
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this.sinkDown(0);
        }
        return top;
    }
    get size() {
        return this.data.length;
    }
    bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[parent].f <= this.data[i].f)
                break;
            [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
            i = parent;
        }
    }
    sinkDown(i: number): void {
        const n = this.data.length;
        for (;;) {
            let min = i;
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            if (l < n && this.data[l].f < this.data[min].f)
                min = l;
            if (r < n && this.data[r].f < this.data[min].f)
                min = r;
            if (min === i)
                break;
            [this.data[min], this.data[i]] = [this.data[i], this.data[min]];
            i = min;
        }
    }
}
// ─── Heuristic ────────────────────────────────────────────────────────────────
/** Octile distance — admissible heuristic for 8-directional grids. */
function octile(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}
// ─── 8-direction offsets ──────────────────────────────────────────────────────
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
];
// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Find shortest path from (sx, sy) to (ex, ey) on a grid.
 *
 * @param grid   grid[y][x] — 0 = walkable, non-zero = wall
 * @param sx     start X (column)
 * @param sy     start Y (row)
 * @param ex     end X (column)
 * @param ey     end Y (row)
 * @returns      Array of [x, y] cells from start to end (inclusive), or [] if unreachable
 */
export function astar(
    grid: number[][],
    sx: number,
    sy: number,
    ex: number,
    ey: number,
): [number, number][] {
    const gridH = grid.length;
    if (gridH === 0)
        return [];
    const gridW = grid[0]?.length ?? 0;
    if (gridW === 0)
        return [];
    if (sx < 0 || sx >= gridW || sy < 0 || sy >= gridH)
        return [];
    if (ex < 0 || ex >= gridW || ey < 0 || ey >= gridH)
        return [];
    if (sx === ex && sy === ey)
        return [[sx, sy]];
    const key = (x: number, y: number) => y * gridW + x;
    const gCost = new Map<number, number>();
    const parent = new Map<number, number>();
    const closed = new Set<number>();
    const open = new MinHeap();
    const startKey = key(sx, sy);
    gCost.set(startKey, 0);
    open.push({ f: octile(sx, sy, ex, ey), x: sx, y: sy });
    while (open.size > 0) {
        const { x: cx, y: cy } = open.pop()!;
        const ck = key(cx, cy);
        if (closed.has(ck))
            continue;
        closed.add(ck);
        if (cx === ex && cy === ey) {
            // Reconstruct
            const path: [number, number][] = [];
            let k = ck;
            while (k !== startKey) {
                const y = Math.floor(k / gridW);
                const x = k % gridW;
                path.unshift([x, y]);
                const pk = parent.get(k);
                if (pk === undefined)
                    break;
                k = pk;
            }
            path.unshift([sx, sy]);
            return path;
        }
        const cg = gCost.get(ck) ?? Infinity;
        for (const [dx, dy, cost] of DIRS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH)
                continue;
            if (grid[ny][nx] !== 0)
                continue;
            // Diagonal: ensure both orthogonal neighbours are walkable (no corner cutting)
            if (dx !== 0 && dy !== 0) {
                if (grid[cy][cx + dx] !== 0 || grid[cy + dy][cx] !== 0)
                    continue;
            }
            const nk = key(nx, ny);
            const ng = cg + cost;
            if (ng < (gCost.get(nk) ?? Infinity)) {
                gCost.set(nk, ng);
                parent.set(nk, ck);
                open.push({ f: ng + octile(nx, ny, ex, ey), x: nx, y: ny });
            }
        }
    }
    return []; // No path
}
