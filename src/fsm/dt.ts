import type { Vehicle } from 'yuka';

interface VehicleWithDt extends Vehicle {
    _dt?: number;
}

/** Store the current frame dt (seconds) on a vehicle. Call once per tick. */
export function setDt(vehicle: Vehicle, dt: number): void {
    (vehicle as VehicleWithDt)._dt = dt;
}
/** Read the frame dt stored on a vehicle; falls back to 1/60 when never set. */
export function getDt(vehicle: Vehicle): number {
    return (vehicle as VehicleWithDt)._dt ?? 1 / 60;
}
