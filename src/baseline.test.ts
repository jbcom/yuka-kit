import { describe, expect, it, vi } from 'vitest';
import { State, StateMachine, Vector3, Vehicle } from 'yuka';
import * as api from './index.js';
import type { GovernorActionName } from './index.js';

const publicGovernorAction: GovernorActionName = 'knightUnblock';

describe('published 0.1.0 source restoration', () => {
  it('preserves the public runtime API', () => {
    expect(publicGovernorAction).toBe('knightUnblock');
    const required = [
      'AI_TYPE_PRESETS',
      'AttackState',
      'BossBrain',
      'BrainRegistry',
      'ChaseEvaluator',
      'FleeState',
      'PatrolState',
      'applyPerception',
      'astar',
      'createBossBrain',
      'createBrain',
      'createCombatVehicle',
      'createEntityManager',
      'createVehicle',
      'followWaypoints',
      'hasAabbLineOfSight2D',
      'inVisionCone',
      'manage',
      'seek',
      'setDt',
      'stepAI',
    ];

    expect(Object.keys(api)).toEqual(expect.arrayContaining(required));
  });

  it('creates an isolated manager and a combat FSM', () => {
    const player = new Vehicle();
    player.position.set(1, 0, 0);
    const enemy = api.createCombatVehicle(
      { speed: 4 },
      { target: player, patrol: { detectionRange: 2 } },
    );
    const manager = api.createEntityManager();

    expect(api.manage(manager, enemy)).toBe(enemy);
    expect(manager.entities).toContain(enemy);
    expect(api.getStateName(enemy.stateMachine)).toBe('patrol');

    api.stepAI(manager, 1 / 60);
    expect(api.getStateName(enemy.stateMachine)).toBe('chase');
  });

  it('ticks registered brains after entity updates', () => {
    const update = vi.fn();
    const manager = { entities: [], update };
    const registry = new api.BrainRegistry();
    const execute = vi.fn();
    const terminate = vi.fn();
    registry.register('agent', { execute, terminate });

    api.stepAI(manager, 0.25, registry);
    expect(update).toHaveBeenCalledWith(0.25);
    expect(execute).toHaveBeenCalledOnce();

    registry.unregister('agent');
    expect(terminate).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
  });

  it('finds grid paths without cutting blocked corners', () => {
    expect(
      api.astar(
        [
          [0, 0, 0],
          [1, 1, 0],
          [0, 0, 0],
        ],
        0,
        0,
        2,
        2,
      ),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);

    expect(api.astar([[0, 1], [1, 0]], 0, 0, 1, 1)).toEqual([]);
  });

  it('provides physics-neutral perception helpers', () => {
    const origin = { x: 0, y: 0, z: 0 };
    expect(
      api.inVisionCone(origin, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, 4, Math.PI / 4),
    ).toBe(true);
    expect(
      api.inVisionCone(origin, { x: 1, y: 0, z: 0 }, { x: -3, y: 0, z: 0 }, 4, Math.PI / 4),
    ).toBe(false);
    const wall = { x: 2, y: 0, width: 1, height: 4 };
    expect(api.hasAabbLineOfSight2D({ x: 0, y: 0 }, { x: 4, y: 0 }, [wall])).toBe(false);
    expect(api.hasAabbLineOfSight2D({ x: 0, y: 3 }, { x: 4, y: 3 }, [wall])).toBe(true);
    expect(api.segmentIntersectsAabb2D({ x: 0, y: 0 }, { x: 1.5, y: 0 }, wall)).toBe(false);

    const fsm = new StateMachine(new Vehicle());
    fsm.add('idle', new State());
    fsm.add('pursuit', new State());
    fsm.changeTo('idle');
    expect(api.applyPerception(true, fsm, 'pursuit')).toBe(true);
    expect(fsm.in('pursuit')).toBe(true);
  });

  it('wires waypoint steering and boss phase progression', () => {
    const vehicle = api.createVehicle({ speed: 3 });
    const handle = api.followWaypoints(vehicle, [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    expect(vehicle.steering.behaviors).toContain(handle.follow);
    handle.clear();
    expect(vehicle.steering.behaviors).not.toContain(handle.follow);

    const boss = new Vehicle();
    api.setTargetPosition(boss, new Vector3(10, 0, 0));
    const brain = api.createBossBrain(boss, [
      { healthThreshold: 1, attacks: [{ type: 'ranged' }] },
      { healthThreshold: 0.65, attacks: [{ type: 'summon' }] },
      { healthThreshold: 0.3, attacks: [{ type: 'melee' }] },
    ]);
    const changed = vi.fn();
    brain.onPhaseChange(changed);
    brain.updatePhase(0.25);
    expect(brain.currentPhase).toBe(2);
    expect(changed).toHaveBeenCalledWith(2);
  });
});
