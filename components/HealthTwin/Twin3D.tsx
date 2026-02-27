import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';

const BodyMesh = () => {
    const meshRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (meshRef.current) {
            // Gentle subtle breathing/floating animation
            meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05;
            meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
        }
    });

    return (
        <group ref={meshRef} position={[0, 0, 0]}>
            {/* Abstract Head */}
            <mesh position={[0, 1.5, 0]}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshStandardMaterial color="#EBE7DE" roughness={0.2} metalness={0.1} />
            </mesh>

            {/* Abstract Torso */}
            <mesh position={[0, 0, 0]}>
                <capsuleGeometry args={[0.5, 1.2, 32, 32]} />
                <meshStandardMaterial color="#A84A00" roughness={0.3} metalness={0.2} />
            </mesh>

            {/* Abstract core aura indicating health */}
            <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.6, 16, 16]} />
                <meshStandardMaterial color="#A84A00" transparent opacity={0.15} />
            </mesh>

            {/* Abstract Limbs (Dots) */}
            {[
                [-0.8, 0, 0], [0.8, 0, 0], // Arms
                [-0.3, -1.2, 0], [0.3, -1.2, 0] // Legs
            ].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]}>
                    <sphereGeometry args={[0.15, 16, 16]} />
                    <meshStandardMaterial color="#EBE7DE" />
                </mesh>
            ))}
        </group>
    );
};

export const Twin3D: React.FC = () => {
    return (
        <Canvas camera={{ position: [0, 1, 5], fov: 45 }} className="w-full h-full">
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <spotLight position={[-10, 10, -5]} intensity={0.5} color="#A84A00" />

            <BodyMesh />

            <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={5} blur={2} far={4} />
            <Environment preset="city" />
            <OrbitControls
                enablePan={false}
                enableZoom={true}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={Math.PI / 2}
                minDistance={3}
                maxDistance={8}
            />
        </Canvas>
    );
};
