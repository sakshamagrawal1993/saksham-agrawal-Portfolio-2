import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';
import * as THREE from 'three';

// Obstacle Types
type ObstacleType = 'BOULDER' | 'TREE' | 'COIN' | 'HEART' | 'GAP';

interface Obstacle {
    id: number;
    type: ObstacleType;
    lane: number; // -1, 0, 1
    startZ: number; // Initial Z position
    offsetZ: number; // Distance moved
    hit: boolean;
}

const SPAWN_DISTANCE = -60;
const LANE_WIDTH = 2;

const ObstacleManager = () => {
    // We use a mix of state (for spawning/React tree) and Refs (for movement)
    // Actually, simpler: State holds the list. Refs update their own transforms.
    // We pass a Mutable Callback to children?
    // OR we manage positions centrally.
    // Central management is better for collision.

    const [obstacles, setObstacles] = useState<Obstacle[]>([]);
    const { speed, status, loseLife, addScore, gainLife } = useRunnerStore();
    const lastSpawnTime = useRef(0);

    // We use a ref to track obstacles for the frame loop to avoid closure staleness
    const obstaclesRef = useRef<Obstacle[]>([]);
    useEffect(() => {
        obstaclesRef.current = obstacles;
    }, [obstacles]);

    useFrame((state) => {
        if (status !== 'playing') return;

        const time = state.clock.elapsedTime;

        // 1. Spawn Logic
        // Calculate spawn rate based on speed. Faster = more frequent?
        // Constant distance between obstacles is safer. Time = Dist / Speed.
        // Let's force minimum distance.
        if (time - lastSpawnTime.current > (1.5 * 10 / speed)) {
            spawnObstacle();
            lastSpawnTime.current = time;
        }

        // 2. Move & Collide (Logic only)
        // Visualization is handled by child components reading the same data? 
        // No, if we update state here, we re-render every frame. BAD.

        // OPTIMIZED APPROACH:
        // The Obstacles in State are "Static" definitions (ID, Type, Lane, StartTime/Z).
        // The *Current Z* is calculated derived from `(Speed * Time)`?
        // No, speed varies. So we accumulate `distance` in Store.
        // Obstacle Z = InitialZ + GameDistance.
        // Collision: If (InitialZ + GameDistance) ~= 0.

        // Let's use `distance` from store!
        // We already have `distance` in store increasing by speed*delta.
        // So Object Z position = StartZ + distance.
        // Player is at Z=0.
        // Spawn at Z = -60 - distance. (So it starts at -60 relative to player).

        // Let's check collisions here using store state (via ref to avoid subscription cost?)
        // `useRunnerStore.getState().distance` is efficient.

        const currentDistance = useRunnerStore.getState().distance;
        const currentLane = useRunnerStore.getState().playerLane;

        // Check active obstacles
        obstaclesRef.current.forEach(obs => {
            if (obs.hit) return;

            // Calculate relative Z
            const z = obs.startZ + currentDistance;

            if (z > 10) {
                // cleanup? We can periodially clean state.
                return;
            }

            // Collision Zone
            if (z > -0.5 && z < 0.5) {
                // Lane Check
                if (obs.lane === currentLane) {
                    // Collision!
                    if (obs.type === 'GAP') {
                        // Check if jumping? (Not implemented in store, need local player state or store jumping)
                        // For now, treat GAP like any obstacle
                        // Actually Plan said "cross only by jumping".
                        // We need `isJumping` in store?
                        // Let's ignore GAP logic for V1 or assume Hit.
                    }

                    if (obs.type === 'COIN') {
                        addScore(50);
                        markHit(obs.id);
                    } else if (obs.type === 'HEART') {
                        gainLife();
                        markHit(obs.id);
                    } else if (['BOULDER', 'TREE'].includes(obs.type)) {
                        loseLife();
                        markHit(obs.id);
                    }
                }
            }
        });

        // Cleanup old obstacles occasionally
        if (obstaclesRef.current.length > 20 && obstaclesRef.current[0].startZ + currentDistance > 20) {
            setObstacles(prev => prev.slice(1));
        }
    });

    const markHit = (id: number) => {
        setObstacles(prev => prev.map(o => o.id === id ? { ...o, hit: true } : o));
    };

    const spawnObstacle = () => {
        const lanes = [-1, 0, 1];
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        // const types: ObstacleType[] = ['BOULDER', 'TREE', 'COIN', 'COIN', 'HEART']; // Unused
        const type = Math.random() < 0.05 ? 'HEART' : (Math.random() < 0.3 ? 'COIN' : (Math.random() < 0.6 ? 'BOULDER' : 'TREE'));

        // Start Z needs to be relative to *current distance* so it appears at fixed absolute Z=-60
        const currentDistance = useRunnerStore.getState().distance;

        setObstacles(prev => [...prev, {
            id: Date.now(),
            type: type as ObstacleType,
            lane,
            startZ: SPAWN_DISTANCE - currentDistance, // Z = StartZ + Dist => -60 - Dist + Dist = -60. Correct.
            offsetZ: 0,
            hit: false
        }]);
    };

    return (
        <>
            {obstacles.map(obs => (
                <ObstacleMesh key={obs.id} obs={obs} />
            ))}
        </>
    );
};

const ObstacleMesh = ({ obs }: { obs: Obstacle }) => {
    const mesh = useRef<THREE.Mesh>(null);
    const { status } = useRunnerStore();

    useFrame(() => {
        if (mesh.current) {
            // Sync position with logic: Z = StartZ + Distance
            const dist = useRunnerStore.getState().distance;
            mesh.current.position.z = obs.startZ + dist;

            // Scale down if hit?
            if (obs.hit) {
                mesh.current.visible = false;
            }
        }
    });

    // Geometry & Material based on type
    const color = obs.type === 'COIN' ? '#fbbf24' : (obs.type === 'HEART' ? '#ef4444' : (obs.type === 'BOULDER' ? '#475569' : '#166534'));

    return (
        <mesh
            ref={mesh}
            position={[obs.lane * LANE_WIDTH, 0.5, obs.startZ]} // Initial pos, updated by useFrame
            castShadow
        >
            {obs.type === 'COIN' || obs.type === 'HEART' ? (
                <sphereGeometry args={[0.3, 16, 16]} />
            ) : (
                obs.type === 'TREE' ? (
                    <coneGeometry args={[0.5, 1.5, 8]} />
                ) : (
                    <dodecahedronGeometry args={[0.5]} />
                )
            )}
            <meshStandardMaterial color={color} emissive={obs.type === 'COIN' ? '#fbbf24' : 'black'} emissiveIntensity={0.5} />
        </mesh>
    );
}

export default ObstacleManager;
