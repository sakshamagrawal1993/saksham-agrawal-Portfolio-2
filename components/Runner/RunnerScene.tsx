// Force refresh - fixing import error
import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Stars, ContactShadows } from '@react-three/drei';
import { useRunnerStore } from './store';
import Player from './Player';
import Track from './Track';
import Obstacles from './Obstacles';

// Main 3D Scene Component
const RunnerScene = () => {
    const { speed, incrementDistance, addScore } = useRunnerStore();
    const { camera, size } = useThree();

    // Responsive Camera Adjustment
    useEffect(() => {
        const aspect = size.width / size.height;
        if (aspect < 1) {
            // Mobile/Portrait: High angle, looking ahead
            camera.position.set(0, 6, 8);
            camera.lookAt(0, -4, -15); // Look lower to bring runner UP
        } else {
            // Desktop/Landscape: Elevated view for better reaction time
            camera.position.set(0, 4, 6);
            camera.lookAt(0, -3, -20); // Look lower to bring runner UP
        }
        camera.updateProjectionMatrix();
    }, [size, camera]);

    // Game loop updates
    useFrame((_, delta) => {
        incrementDistance(speed * delta);
        addScore(speed * delta * 0.1);
    });

    return (
        <>
            {/* Atmospheric components from Drei */}
            <Environment preset="city" />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />

            <Player />
            <Track />
            <Obstacles />

            <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.25} far={10} color="#000000" />
        </>
    );
};

export default RunnerScene;
