import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

const WireframeHuman = () => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    // Color theme based on the uploaded image (cyan/blue glowing wireframe)
    const color = "#00d2ff";

    useFrame((state) => {
        if (groupRef.current) {
            // Gentle hovering animation
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            // Slow rotation to showcase the 3D mesh
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
        }

        if (materialRef.current) {
            // Slight pulsing effect on the wireframe emissive intensity
            materialRef.current.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
        }
    });

    const material = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            wireframe: true,
            transparent: true,
            opacity: 0.8,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide
        });
    }, [color]);

    // Helper to create joints (solid glowing spheres)
    const Joint = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => (
        <mesh position={position}>
            <sphereGeometry args={[0.08 * scale, 16, 16]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1}
                roughness={0}
                metalness={1}
            />
        </mesh>
    );

    return (
        <group ref={groupRef} position={[0, 0.5, 0]}>
            <mesh material={material} position={[0, 1.6, 0]}>
                <icosahedronGeometry args={[0.35, 2]} />
            </mesh>

            <mesh material={material} position={[0, 1.25, 0]}>
                <cylinderGeometry args={[0.1, 0.15, 0.3, 8]} />
            </mesh>

            <mesh material={material} position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.55, 0.4, 1.2, 12, 4]} />
            </mesh>

            <mesh material={material} position={[-0.75, 0.4, 0]} rotation={[0, 0, -0.2]}>
                <cylinderGeometry args={[0.12, 0.1, 1.0, 8, 3]} />
            </mesh>
            <mesh material={material} position={[-1.05, -0.6, 0]} rotation={[0, 0, -0.1]}>
                <cylinderGeometry args={[0.1, 0.08, 1.0, 8, 3]} />
            </mesh>

            <mesh material={material} position={[0.75, 0.4, 0]} rotation={[0, 0, 0.2]}>
                <cylinderGeometry args={[0.12, 0.1, 1.0, 8, 3]} />
            </mesh>
            <mesh material={material} position={[1.05, -0.6, 0]} rotation={[0, 0, 0.1]}>
                <cylinderGeometry args={[0.1, 0.08, 1.0, 8, 3]} />
            </mesh>

            <mesh material={material} position={[-0.25, -0.7, 0]} rotation={[0, 0, -0.1]}>
                <cylinderGeometry args={[0.18, 0.12, 1.2, 8, 4]} />
            </mesh>
            <mesh material={material} position={[-0.4, -1.9, 0]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.08, 1.2, 8, 4]} />
            </mesh>

            <mesh material={material} position={[0.25, -0.7, 0]} rotation={[0, 0, 0.1]}>
                <cylinderGeometry args={[0.18, 0.12, 1.2, 8, 4]} />
            </mesh>
            <mesh material={material} position={[0.4, -1.9, 0]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.08, 1.2, 8, 4]} />
            </mesh>

            {/* Joints and connection points */}
            {/* Neck/Shoulders */}
            <Joint position={[0, 1.1, 0]} scale={1.2} />
            <Joint position={[-0.6, 0.9, 0]} scale={1.5} />
            <Joint position={[0.6, 0.9, 0]} scale={1.5} />

            {/* Elbows */}
            <Joint position={[-0.9, -0.1, 0]} />
            <Joint position={[0.9, -0.1, 0]} />

            {/* Wrists */}
            <Joint position={[-1.15, -1.1, 0]} scale={0.8} />
            <Joint position={[1.15, -1.1, 0]} scale={0.8} />

            {/* Hips */}
            <Joint position={[-0.25, -0.1, 0]} scale={1.5} />
            <Joint position={[0.25, -0.1, 0]} scale={1.5} />

            {/* Knees */}
            <Joint position={[-0.35, -1.3, 0]} scale={1.2} />
            <Joint position={[0.35, -1.3, 0]} scale={1.2} />

            {/* Ankles */}
            <Joint position={[-0.4, -2.5, 0]} scale={0.8} />
            <Joint position={[0.4, -2.5, 0]} scale={0.8} />

            {/* Inner Core / Heart */}
            <mesh position={[0, 0.6, 0]}>
                <icosahedronGeometry args={[0.2, 1]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#ffffff"
                    emissiveIntensity={2}
                    wireframe={true}
                />
            </mesh>

            {/* Brain node */}
            <mesh position={[0, 1.6, 0]}>
                <sphereGeometry args={[0.15, 8, 8]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#00d2ff"
                    emissiveIntensity={1.5}
                    wireframe={true}
                />
            </mesh>
        </group>
    );
};

export const Twin3D: React.FC = () => {
    return (
        <div className="w-full h-full bg-gradient-to-b from-[#0a1128] to-[#000000]">
            <Canvas camera={{ position: [0, 1, 6], fov: 50 }} className="w-full h-full">
                <color attach="background" args={['#050814']} />
                <fog attach="fog" args={['#050814', 4, 15]} />

                <ambientLight intensity={0.2} color="#00d2ff" />
                <directionalLight position={[10, 10, 5]} intensity={2} color="#00d2ff" />
                <directionalLight position={[-10, -10, -5]} intensity={1} color="#0055ff" />
                <spotLight position={[0, 10, 0]} intensity={2} color="#ffffff" penumbra={1} angle={0.5} />

                <WireframeHuman />

                <Environment preset="night" />

                {/* Glowing platform */}
                <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[1.5, 1.6, 32]} />
                    <meshBasicMaterial color="#00d2ff" transparent opacity={0.3} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[1.5, 32]} />
                    <meshBasicMaterial color="#00d2ff" transparent opacity={0.05} side={THREE.DoubleSide} />
                </mesh>

                <OrbitControls
                    enablePan={false}
                    enableZoom={true}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI / 2 + 0.1}
                    minDistance={4}
                    maxDistance={10}
                    autoRotate
                    autoRotateSpeed={0.5}
                />
            </Canvas>
        </div>
    );
};
