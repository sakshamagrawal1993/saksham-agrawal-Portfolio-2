import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';

const Track = () => {
    const materialRef = useRef<any>();
    const { speed, status } = useRunnerStore();

    useFrame((state, delta) => {
        if (status === 'playing' && materialRef.current) {
            // Scrolls the texture to simulate movement
            // Assuming UV mapping along Y axis or specific direction
            // For a simple color track, we might not see movement unless we have a grid texture
            // Let's use map offset if texture exists, or just move the object?
            // Infinite runner usually moves floor backwards

            materialRef.current.map.offset.y -= speed * delta * 0.1;
        }
    });

    return (
        <group>
            {/* Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
                <planeGeometry args={[10, 100]} />
                {/* Using a grid helper as texture for now or basic material */}
                <meshStandardMaterial color="#1e293b" />
            </mesh>

            {/* Grid Helper for visual speed */}
            <gridHelper args={[10, 100, 0xffffff, 0x555555]} position={[0, 0.01, 0]} rotation={[0, 0, 0]} />

            {/* Moving Floor Effect: We need multiple segments recycling */}
            <MovingFloor />
        </group>
    );
};

const MovingFloor = () => {
    const mesh = useRef<any>();
    const { speed, status } = useRunnerStore();

    useFrame((state, delta) => {
        if (status === 'playing' && mesh.current) {
            mesh.current.position.z += speed * delta;
            if (mesh.current.position.z > 10) {
                mesh.current.position.z = -10;
            }
        }
    });

    return (
        <gridHelper ref={mesh} args={[20, 40, 0x475569, 0x334155]} position={[0, 0.01, -20]} />
    )
}

export default Track;
