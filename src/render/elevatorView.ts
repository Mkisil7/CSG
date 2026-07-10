import * as THREE from 'three';
import { ElevatorSystem } from '../core/elevator';
import { FLOOR_HEIGHT, SHAFT_WIDTH, floorY } from './layout';

const CAB_BODY = 0xf2b366;
const CAB_LOADING = 0xf7d266;
const FRAME = new THREE.MeshLambertMaterial({ color: 0xd99a4e });

/** Renders one shaft's cab(s): a pastel cab with panel lines and a state light. */
export class ElevatorViews {
  private readonly group = new THREE.Group();
  private cabs: { root: THREE.Group; body: THREE.MeshLambertMaterial; light: THREE.MeshBasicMaterial }[] = [];

  constructor(
    parent: THREE.Object3D,
    private readonly shaftX: number,
    origin: { x: number; z: number },
  ) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  sync(elevator: ElevatorSystem): void {
    while (this.cabs.length < elevator.cars.length) {
      const root = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: CAB_BODY });
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH * 0.7, FLOOR_HEIGHT * 0.8, 1.6),
        bodyMat,
      );
      cab.castShadow = true;
      root.add(cab);
      // Panel lines: slim frame strips across the cab face.
      root.add(strip(SHAFT_WIDTH * 0.72, 0.08, 1.62, 0, FLOOR_HEIGHT * 0.18));
      root.add(strip(SHAFT_WIDTH * 0.72, 0.08, 1.62, 0, -FLOOR_HEIGHT * 0.18));
      root.add(strip(0.08, FLOOR_HEIGHT * 0.82, 1.62, 0, 0));
      // Indicator light on top.
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat);
      light.position.y = FLOOR_HEIGHT * 0.4 + 0.15;
      root.add(light);

      this.cabs.push({ root, body: bodyMat, light: lightMat });
      this.group.add(root);
    }

    elevator.cars.forEach((car, i) => {
      const cab = this.cabs[i];
      cab.root.position.set(this.shaftX, floorY(car.pos) + FLOOR_HEIGHT * 0.4, 0);
      cab.body.color.setHex(car.state === 'loading' ? CAB_LOADING : CAB_BODY);
      cab.light.color.setHex(
        car.state === 'loading' ? 0x7cf78c : car.state === 'moving' ? 0xf7e36b : 0xdddddd,
      );
    });
  }
}

function strip(w: number, h: number, d: number, x: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), FRAME);
  m.position.set(x, y, 0);
  return m;
}
