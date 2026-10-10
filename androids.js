import * as THREE from 'three';

const SHELL = new THREE.MeshPhysicalMaterial({ color: 0xf5f7fa, roughness: 0.26, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.18 });
const JOINT = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.45, metalness: 0.75 });
const VISOR = new THREE.MeshPhysicalMaterial({ color: 0x07090d, roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });

const G = {
  thigh: new THREE.CapsuleGeometry(0.065, 0.29, 6, 14),
  shin: new THREE.CapsuleGeometry(0.052, 0.3, 6, 14),
  foot: new THREE.SphereGeometry(0.05, 16, 12),
  upperArm: new THREE.CapsuleGeometry(0.042, 0.196, 6, 12),
  foreArm: new THREE.CapsuleGeometry(0.037, 0.196, 6, 12),
  hand: new THREE.SphereGeometry(0.042, 14, 10),
  ball: new THREE.SphereGeometry(1, 16, 12),
  torso: new THREE.CapsuleGeometry(0.16, 0.28, 8, 20),
  waist: new THREE.CylinderGeometry(0.14, 0.14, 0.07, 20),
  neck: new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12),
  head: new THREE.SphereGeometry(0.125, 40, 28),
  visor: new THREE.SphereGeometry(0.1285, 40, 28, Math.PI / 2 - 1.0, 2.0, 0.55, 1.75),
  ear: new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14),
  badge: new THREE.CircleGeometry(0.05, 32),
  badgeRing: new THREE.RingGeometry(0.056, 0.066, 32)
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function joint(r, x, y, z) {
  const m = mesh(G.ball, JOINT, x, y, z);
  m.scale.setScalar(r);
  return m;
}

/**
 * Builds a sleek white android with a smooth mask face and a colored chest icon.
 * Facing direction is +Z. Returns the rig used by movement.js for animation.
 */
export function createAndroid(color) {
  const group = new THREE.Group();
  const L1 = 0.42, L2 = 0.42, FOOT = 0.06;

  const pelvis = new THREE.Group();
  pelvis.position.y = L1 + L2 + FOOT;
  group.add(pelvis);

  const hipShape = joint(0.13, 0, 0, 0);
  hipShape.scale.set(0.16, 0.09, 0.11);
  pelvis.add(hipShape);

  // Legs
  const legs = [];
  for (const sx of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.09, 0, 0);
    hip.add(joint(0.07, 0, 0, 0));
    hip.add(mesh(G.thigh, SHELL, 0, -0.21, 0));
    const knee = new THREE.Group();
    knee.position.y = -L1;
    knee.add(joint(0.058, 0, 0, 0));
    knee.add(mesh(G.shin, SHELL, 0, -0.21, 0));
    const foot = mesh(G.foot, SHELL, 0, -0.435, 0.06);
    foot.scale.set(1.1, 0.9, 2.2);
    knee.add(foot);
    hip.add(knee);
    pelvis.add(hip);
    legs.push({ hip, knee });
  }

  // Torso
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = mesh(G.torso, SHELL, 0, 0.31, 0);
  torsoMesh.scale.set(1.12, 1, 0.78);
  torso.add(torsoMesh);
  const waist = mesh(G.waist, JOINT, 0, 0.04, 0);
  waist.scale.z = 0.8;
  torso.add(waist);

  const badgeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 });
  const badge = new THREE.Mesh(G.badge, badgeMat);
  badge.position.set(0, 0.4, 0.13);
  const badgeRing = new THREE.Mesh(G.badgeRing, JOINT);
  badgeRing.position.set(0, 0.4, 0.129);
  torso.add(badge, badgeRing);

  // Arms
  const arms = [];
  for (const sx of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.215, 0.5, 0);
    shoulder.add(joint(0.055, 0, 0, 0));
    shoulder.add(mesh(G.upperArm, SHELL, 0, -0.14, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    elbow.add(joint(0.043, 0, 0, 0));
    elbow.add(mesh(G.foreArm, SHELL, 0, -0.135, 0));
    elbow.add(mesh(G.hand, SHELL, 0, -0.3, 0));
    shoulder.add(elbow);
    torso.add(shoulder);
    arms.push({ shoulder, elbow });
  }

  // Head with smooth mask face
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  head.add(mesh(G.neck, JOINT, 0, -0.02, 0));
  const shell = mesh(G.head, SHELL, 0, 0.11, 0);
  shell.scale.set(1, 1.12, 1.02);
  const visor = mesh(G.visor, VISOR, 0, 0.11, 0);
  visor.scale.set(1, 1.12, 1.02);
  head.add(shell, visor);
  for (const sx of [1, -1]) {
    const ear = mesh(G.ear, JOINT, sx * 0.127, 0.11, 0);
    ear.rotation.z = Math.PI / 2;
    head.add(ear);
  }

  return {
    group, pelvis, torso, head, legs, arms, badgeMat,
    dims: { L1, L2, foot: FOOT },
    seed: Math.random() * 10
  };
}
