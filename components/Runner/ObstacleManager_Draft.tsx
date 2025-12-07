import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';
import { Vector3 } from 'three';

// Obstacle Types
type ObstacleType = 'BOULDER' | 'TREE' | 'COIN' | 'HEART' | 'GAP';

interface Obstacle {
    id: number;
    type: ObstacleType;
    lane: number; // -1, 0, 1
    z: number; // starts far negative (e.g., -50) and moves to +10
    hit: boolean;
}

const SPAWN_DISTANCE = -60;
const LANE_WIDTH = 2;

const ObstacleManager = () => {
    const [obstacles, setObstacles] = useState<Obstacle[]>([]);
    const { speed, status, loseLife, addScore, gainLife } = useRunnerStore();
    const lastSpawnTime = useRef(0);

    const obstaclesRef = useRef(obstacles);
    obstaclesRef.current = obstacles; // Keep ref updated for useFrame

    useFrame((state, delta) => {
        if (status !== 'playing') return;

        // 1. Spawn Logic
        if (state.clock.elapsedTime - lastSpawnTime.current > (10 / speed)) { // Spawn rate depends on speed
            spawnObstacle();
            lastSpawnTime.current = state.clock.elapsedTime;
        }

        // 2. Move & Collide
        const playerZ = 0; // Player is static at 0
        // We need to know Player lane. Since Player is a separate component, 
        // ideally store holds lane, OR we pass player ref.
        // For simplicity, let's assume Player updates a shared ref or we strictly check against store state if we moved lane logic there.
        // BUT Player has local state for smooth animation. 
        // Hack: We can read Player state from a global ref/store, but 'store' doesn't have lane.
        // Let's rely on standard "box" collision in 3D using standard Three.js checking if we had references.
        // ALternative: Let's assume discrete lanes for collision (easier).
        // The visual player lerps, but logic player is instantly in lane? No, that's unfair.
        // Let's use a "PlayerLane" global variable or simple heuristic:
        // If obstacle Z is close to 0, check control input?

        // Better: Add `currentLane` to store.

        // For now, let's implement the movement logic first.

        setObstacles(prev => {
            return prev.map(obs => {
                const newZ = obs.z + speed * delta;

                // Checking collision manually if Z is within player depth
                if (!obs.hit && Math.abs(newZ - playerZ) < 0.5) {
                    // Check Lane Collision
                    // We need to know current player lane from somewhere.
                    // Let's temporarily assume we can get it from an imperative handle or window?
                    // Actually, let's modify Store to track 'playerLane' for collision logic
                    // Or communicate via an Event.

                    // Let's use a workaround: The Player component will check collisions itself?
                    // No, Manager manages data.

                    // Let's check window.currentGameLane (dirty but works for rapid prototype)
                    // Or better: Player writes to a Ref stored in Store?
                }

                return { ...obs, z: newZ };
            }).filter(obs => obs.z < 10); // Despawn behind camera
        });
    });

    const spawnObstacle = () => {
        const lanes = [-1, 0, 1];
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        const types: ObstacleType[] = ['BOULDER', 'TREE', 'COIN', 'COIN', 'COIN', 'HEART'];
        // Weigh distribution
        const type = Math.random() < 0.1 ? 'HEART' : (Math.random() < 0.4 ? 'COIN' : (Math.random() < 0.7 ? 'BOULDER' : 'TREE'));

        const newObs: Obstacle = {
            id: Date.now(),
            type: type as ObstacleType,
            lane,
            z: SPAWN_DISTANCE,
            hit: false
        };

        setObstacles(prev => [...prev, newObs]);
    };

    // RENDER OBSTACLES
    // For collision, we will actually let the individual Obstacle Mesh check distance to 0?
    // Or we update the store with obstacles and Player component checks?
    // Let's pass the list of obstacles to a specialized renderer that also checks collision?

    return (
        <>
            <ObstacleRenderer obstacles={obstacles} setObstacles={setObstacles} />
        </>
    );
};

// Component to render and collision check
const ObstacleRenderer = ({ obstacles, setObstacles }: { obstacles: Obstacle[], setObstacles: any }) => {
    const { loseLife, addScore, gainLife } = useRunnerStore();

    // We need Player Lane. 
    // Let's start listening to keydown here too? No, player state is local.
    // Let's Move the `lane` state to the Store. Ideally.

    // OK, let's update Store to include `playerLane` so collision is accurate to user intent.
    // Or we assume Player component tells us.

    return (
        <>
            {obstacles.map(obs => (
                <ObstacleMesh key={obs.id} obs={obs} onHit={() => {
                    if (obs.hit) return;
                    // Mark hit
                    setObstacles((prev: Obstacle[]) => prev.map(o => o.id === obs.id ? { ...o, hit: true } : o));

                    if (obs.type === 'COIN') addScore(50);
                    else if (obs.type === 'HEART') gainLife();
                    else loseLife();
                }} />
            ))}
        </>
    )
}

const ObstacleMesh = ({ obs, onHit }: { obs: Obstacle, onHit: () => void }) => {
    // A separate component for each obstacle to check its own collision
    // It's a bit heavy but correct for React.
    // We can use useFrame here to check proximity to Player (which is effectively Lane X, Z=0)

    // To know Player Lane, we really DO need the store or a context.
    // I will refactor `store.ts` to include `playerLane`.

    // Temporary render
    const color = obs.type === 'COIN' ? 'yellow' : (obs.type === 'HEART' ? 'red' : 'green');
    const geometry = obs.type === 'COIN' ? <sphereGeometry args={[0.3]} /> : <boxGeometry args={[1, 1, 1]} />;

    // Note: This mesh is static relative to its Z? No, parent updates its Z? 
    // No, manager updates Z in state, sending down new props. React re-renders?
    // This is bad for performance (hundreds of re-renders per frame).
    // CORRECT APPROACH in R3F:
    // Update refs directly in useFrame for movement.
    // The Manager should manage refs, not state that triggers re-render.

    return (
        <mesh position={[obs.lane * LANE_WIDTH, 0.5, obs.z]}>
            {geometry}
            <meshStandardMaterial color={color} />
        </mesh>
    );
};

export default ObstacleManager;
