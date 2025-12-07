import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';

const LANE_WIDTH = 2;
const JUMP_FORCE = 5;
const GRAVITY = 15;

const Player = () => {
    const mesh = useRef<any>();
    // const [lane, setLane] = useState(0); // REMOVED local state
    // We use store lane for logic, but we can keep local ref for animation targeting?
    // Actually, let's read lane FROM store.

    // Note: changing store causes re-render of this component, which is fine for lane change (rare event).
    const { status, playerLane, setPlayerLane } = useRunnerStore();

    const [yVelocity, setYVelocity] = useState(0);
    const [isJumping, setIsJumping] = useState(false);

    // Controls
    useEffect(() => {
        if (status !== 'playing') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowLeft':
                    setPlayerLane(Math.max(playerLane - 1, -1));
                    break;
                case 'ArrowRight':
                    setPlayerLane(Math.min(playerLane + 1, 1));
                    break;
                case 'ArrowUp':
                    if (!isJumping) {
                        setYVelocity(JUMP_FORCE);
                        setIsJumping(true);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [status, isJumping, playerLane, setPlayerLane]); // Added playerLane and setPlayerLane to dependencies

    useFrame((_, delta) => {
        if (!mesh.current || status !== 'playing') return;

        // Horizontal movement (Lerp for smoothness)
        const targetX = playerLane * LANE_WIDTH;
        mesh.current.position.x += (targetX - mesh.current.position.x) * 15 * delta;

        // Vertical movement (Jump physics)
        if (isJumping) {
            mesh.current.position.y += yVelocity * delta;
            setYVelocity(v => v - GRAVITY * delta);

            // Ground collision
            if (mesh.current.position.y <= 0.5) { // Box height/2
                mesh.current.position.y = 0.5;
                setIsJumping(false);
                setYVelocity(0);
            }
        } else {
            mesh.current.position.y = 0.5;
        }

        // Pass player position to store/manager for collision? 
        // Actually, simpler to check collision in ObstacleManager by reading player ref or simplified lane logic
        // We will attach a userData to mesh for easy access
        mesh.current.userData = { lane: playerLane, isJumping, position: mesh.current.position };
    });

    return (
        <group ref={mesh} position={[0, 0.5, 0]}>
            {/* Body */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.8, 0.8, 0.8]} />
                <meshStandardMaterial color="#fbbf24" roughness={0.2} metalness={0.8} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.6, 0]} castShadow>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.2} metalness={0.8} />
            </mesh>
            {/* Eyes (Visor) */}
            <mesh position={[0, 0.65, 0.26]}>
                <boxGeometry args={[0.3, 0.1, 0.05]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} />
            </mesh>
        </group>
    );
};

export default Player;
