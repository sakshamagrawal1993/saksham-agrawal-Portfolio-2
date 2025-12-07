import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';

// Basic Infinite Floor
const Track = () => {
    return (
        <group>
            {/* Static floor plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -50]} receiveShadow>
                <planeGeometry args={[100, 200]} />
                <meshStandardMaterial color="#0f172a" roughness={1} />
            </mesh>

            {/* Moving Grid Effect */}
            <MovingGrid />
        </group>
    );
};

const MovingGrid = () => {
    const gridRef = useRef<any>();
    const { speed, status } = useRunnerStore();

    useFrame((_, delta) => {
        if (status === 'playing' && gridRef.current) {
            // Move grid towards camera
            gridRef.current.position.z += speed * delta;
            // Reset position to loop
            if (gridRef.current.position.z > 10) {
                gridRef.current.position.z = 0;
            }
        }
    });

    return (
        <gridHelper
            ref={gridRef}
            args={[100, 100, 0x334155, 0x1e293b]}
            position={[0, 0.01, -50]}
        />
    )
}

export default Track;
