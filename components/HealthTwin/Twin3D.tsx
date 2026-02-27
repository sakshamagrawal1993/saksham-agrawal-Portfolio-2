import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Fallback geometric human if the GLTF fails to load
const FallbackHuman = () => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    const color = "#A84A00";

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
        }

        if (materialRef.current) {
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
            {/* Arms */}
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
            {/* Legs */}
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

            {/* Joints */}
            <Joint position={[0, 1.1, 0]} scale={1.2} />
            <Joint position={[-0.6, 0.9, 0]} scale={1.5} />
            <Joint position={[0.6, 0.9, 0]} scale={1.5} />
            <Joint position={[-0.9, -0.1, 0]} />
            <Joint position={[0.9, -0.1, 0]} />
            <Joint position={[-1.15, -1.1, 0]} scale={0.8} />
            <Joint position={[1.15, -1.1, 0]} scale={0.8} />
            <Joint position={[-0.25, -0.1, 0]} scale={1.5} />
            <Joint position={[0.25, -0.1, 0]} scale={1.5} />
            <Joint position={[-0.35, -1.3, 0]} scale={1.2} />
            <Joint position={[0.35, -1.3, 0]} scale={1.2} />
            <Joint position={[-0.4, -2.5, 0]} scale={0.8} />
            <Joint position={[0.4, -2.5, 0]} scale={0.8} />

            {/* Inner Core */}
            <mesh position={[0, 0.6, 0]}>
                <icosahedronGeometry args={[0.2, 1]} />
                <meshStandardMaterial color="#A84A00" emissive="#A84A00" emissiveIntensity={2} wireframe={true} />
            </mesh>

            {/* Brain node */}
            <mesh position={[0, 1.6, 0]}>
                <sphereGeometry args={[0.15, 8, 8]} />
                <meshStandardMaterial color="#EBE7DE" emissive="#EBE7DE" emissiveIntensity={1.5} wireframe={true} />
            </mesh>
        </group>
    );
};

// Component to load external GLTF/GLB models seamlessly
const ExternalModel = ({ url }: { url: string }) => {
    // Attempt to load the model. If it's missing, this component will throw and the ErrorBoundary/Fallback will catch it.
    const { scene } = useGLTF(url);
    const groupRef = useRef<THREE.Group>(null);

    // Apply the wireframe material and theme colors to all meshes in the imported model
    const color = "#A84A00";
    const customMaterial = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2, // Subtle glow
            wireframe: true,        // Wireframe style applied to the imported unity/blender mesh
            transparent: true,
            opacity: 0.8,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide
        });
    }, [color]);

    useMemo(() => {
        if (scene) {
            scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = customMaterial;
                }
            });
        }
    }, [scene, customMaterial]);

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
            groupRef.current.scale.setScalar(1.5); // Adjust scale based on your typical Unity exports
            groupRef.current.position.y -= 1; // Center it slightly down
        }

        if (customMaterial) {
            customMaterial.emissiveIntensity = 0.2 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
        }
    });

    return (
        <group ref={groupRef}>
            <primitive object={scene} />
        </group>
    );
};

// Preload if the file exists (silently fails if it doesn't thanks to the catch in actual usage)
// useGLTF.preload('/models/human.glb');

class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

export const Twin3D: React.FC = () => {
    // The background is set to transparent so it blends perfectly with the #F5F2EB background of the landing page.
    return (
        <div className="w-full h-full relative" style={{ background: 'transparent' }}>
            {/* Added a subtle overlay glow to blend the 3D space with the #F5F2EB page */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F5F2EB]/10 to-[#F5F2EB] pointer-events-none z-10" />

            <Canvas camera={{ position: [0, 1, 6], fov: 50 }} className="w-full h-full" style={{ background: 'transparent' }}>
                <ambientLight intensity={0.5} color="#ffffff" />
                <directionalLight position={[10, 10, 5]} intensity={1.5} color="#A84A00" />
                <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#EBE7DE" />
                <spotLight position={[0, 10, 0]} intensity={1} color="#ffffff" penumbra={1} angle={0.5} />

                {/* Attempt to load the external model, fallback to procedural one if the file isn't found */}
                <ErrorBoundary fallback={<FallbackHuman />}>
                    <Suspense fallback={<FallbackHuman />}>
                        <ExternalModel url="/models/human.glb" />
                    </Suspense>
                </ErrorBoundary>

                <Environment preset="studio" />

                {/* Contact shadow connecting the model to the #F5F2EB floor */}
                <ContactShadows position={[0, -2.5, 0]} opacity={0.3} scale={8} blur={2.5} far={4} color="#A84A00" />

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
