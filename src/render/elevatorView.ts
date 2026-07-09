import * as THREE from 'three';
import { ElevatorSystem } from '../core/elevator';
import { FLOOR_HEIGHT, SHAFT_WIDTH, SHAFT_X, floorY } from './layout';

/** Renders each elevator car as a pastel cab moving in the shaft. */
export class ElevatorViews {
  private readonly group = new THREE.Group();
  private cabs: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  sync(elevator: ElevatorSystem): void {
    while (this.cabs.length < elevator.cars.length) {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH * 0.7, FLOOR_HEIGHT * 0.8, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xf2b366 }),
      );
      cab.castShadow = true;
      this.cabs.push(cab);
      this.group.add(cab);
    }

    elevator.cars.forEach((car, i) => {
      const cab = this.cabs[i];
      // Fan multiple cars slightly across the shaft depth so they all read.
      const spread = elevator.cars.length > 1 ? (i / (elevator.cars.length - 1) - 0.5) * 0.7 : 0;
      cab.position.set(
        SHAFT_X + spread * SHAFT_WIDTH * 0.4,
        floorY(car.pos) + FLOOR_HEIGHT * 0.4,
        spread * 0.5,
      );
      const mat = cab.material as THREE.MeshLambertMaterial;
      mat.color.setHex(car.state === 'loading' ? 0xf7d266 : 0xf2b366);
    });
  }
}
