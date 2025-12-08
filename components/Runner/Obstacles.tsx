import { useRef, useState, useEffect } from 'react';
// Force refresh - fixing import error

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

const Obstacles = () => {
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
                    const isJumping = useRunnerStore.getState().isJumping;

                    if (obs.type === 'COIN') {
                        addScore(50);
                        markHit(obs.id);
                    } else if (obs.type === 'HEART') {
                        gainLife();
                        markHit(obs.id);
                    } else {
                        // Harmful Obstacles (Boulder, Tree)
                        // Can we jump over them?
                        // If jumping, we avoid them? 
                        // Let's say yes for now to satisfy user request "jump over the obstacle".
                        // Logic: If NOT Jumping, then Hit.
                        if (!isJumping) {
                            loseLife();
                            markHit(obs.id);
                        } else {
                            // verify jump height? 
                            // Simplification: Jumping = Invincible against obstacles (but not coins/hearts? No, we should still collect coins if we jump through them? 
                            // Actually, in 3D, if you jump OVER a coin you miss it. 
                            // But for "Obstacle", jumping saves you.
                        }
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
        // Shuffle lanes or pick 1-2 random lanes
        // We want at least 1 gap. So max 2 obstacles.
        const numObstacles = Math.random() < 0.4 ? 2 : 1; // 40% chance of 2 obstacles

        // Helper to get random type
        const getType = () => {
            const r = Math.random();
            if (r < 0.1) return 'HEART';
            if (r < 0.4) return 'COIN';
            if (r < 0.7) return 'BOULDER';
            return 'TREE';
        }

        const currentDistance = useRunnerStore.getState().distance;
        // Shuffle lanes
        const shuffledLanes = lanes.sort(() => 0.5 - Math.random());
        const selectedLanes = shuffledLanes.slice(0, numObstacles);

        const newObstacles: Obstacle[] = selectedLanes.map((lane, index) => ({
            id: Date.now() + index, // Ensure unique ID
            type: getType(),
            lane,
            startZ: SPAWN_DISTANCE - currentDistance,
            offsetZ: 0,
            hit: false
        }));

        setObstacles(prev => [...prev, ...newObstacles]);
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
    const group = useRef<THREE.Group>(null);

    useFrame(() => {
        if (group.current) {
            // Sync position with logic: Z = StartZ + Distance
            const dist = useRunnerStore.getState().distance;
            group.current.position.z = obs.startZ + dist;

            // Scale down if hit?
            if (obs.hit) {
                group.current.visible = false;
            }
        }
    });

    const color = obs.type === 'COIN' ? '#fbbf24' : (obs.type === 'HEART' ? '#ef4444' : (obs.type === 'BOULDER' ? '#475569' : '#166534'));

    return (
        <group
            ref={group}
            position={[obs.lane * LANE_WIDTH, 0.5, obs.startZ]}
        >
            {obs.type === 'COIN' ? (
                // Coin needs rotation
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.3, 0.3, 0.1, 32]} />
                    <meshStandardMaterial color={color} emissive="#fbbf24" emissiveIntensity={0.8} roughness={0.4} />
                </mesh>
            ) : (
                // Others are standard upright meshes
                <mesh castShadow>
                    {obs.type === 'HEART' && <dodecahedronGeometry args={[0.3]} />}
                    {obs.type === 'TREE' && <coneGeometry args={[0.5, 1.5, 8]} />}
                    {obs.type === 'BOULDER' && <icosahedronGeometry args={[0.5, 0]} />}

                    <meshStandardMaterial
                        color={color}
                        emissive={obs.type === 'HEART' ? '#ef4444' : '#000000'}
                        emissiveIntensity={0.8}
                        roughness={0.4}
                    />
                </mesh>
            )}
        </group>
    );
}

export default Obstacles;
