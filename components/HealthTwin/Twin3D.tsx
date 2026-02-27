import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import { useHealthTwinStore } from '../../store/healthTwin';

// FBX model URLs from Supabase storage
const MALE_MODEL_URL = "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/Digital%20Twin/male%20body.fbx";
const FEMALE_MODEL_URL = "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/Digital%20Twin/Female%20body.fbx";

// Brownish wireframe material (matches the theme aesthetic)
const MESH_COLOR = "#A84A00";

// Fallback geometric human if the FBX fails to load
const FallbackHuman = () => {
    const groupRef = useRef<THREE.Group>(null);

    const color = MESH_COLOR;

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
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
            <mesh material={material} position={[-0.75, 0.4, 0]} rotation={[0, 0, -0.2]}>
                <cylinderGeometry args={[0.12, 0.1, 1.0, 8, 3]} />
            </mesh>
            <mesh material={material} position={[0.75, 0.4, 0]} rotation={[0, 0, 0.2]}>
                <cylinderGeometry args={[0.12, 0.1, 1.0, 8, 3]} />
            </mesh>
            <mesh material={material} position={[-0.25, -0.7, 0]} rotation={[0, 0, -0.1]}>
                <cylinderGeometry args={[0.18, 0.12, 1.2, 8, 4]} />
            </mesh>
            <mesh material={material} position={[0.25, -0.7, 0]} rotation={[0, 0, 0.1]}>
                <cylinderGeometry args={[0.18, 0.12, 1.2, 8, 4]} />
            </mesh>
            <Joint position={[0, 1.1, 0]} scale={1.2} />
            <Joint position={[-0.6, 0.9, 0]} scale={1.5} />
            <Joint position={[0.6, 0.9, 0]} scale={1.5} />
            <Joint position={[-0.25, -0.1, 0]} scale={1.5} />
            <Joint position={[0.25, -0.1, 0]} scale={1.5} />
        </group>
    );
};

// Component to load external FBX models from Supabase
const FBXModel = ({ url }: { url: string }) => {
    const fbx = useLoader(FBXLoader, url);
    const groupRef = useRef<THREE.Group>(null);

    const customMaterial = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            color: MESH_COLOR,
            emissive: MESH_COLOR,
            emissiveIntensity: 0.3,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide
        });
    }, []);

    // Override all materials in the imported model
    useMemo(() => {
        if (fbx) {
            fbx.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = customMaterial;
                }
            });
        }
    }, [fbx, customMaterial]);

    useFrame((state) => {
        if (groupRef.current) {
            // Gentle floating animation
            const baseY = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            groupRef.current.position.y = baseY;
            // Slow auto-rotation
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
        }

        // Subtle emissive pulsing
        if (customMaterial) {
            customMaterial.emissiveIntensity = 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
        }
    });

    // Auto-center and scale: FBX exports often have different coordinate systems
    const { scale, position } = useMemo(() => {
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Target a height of ~4 units in the scene
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = 4 / maxDim;

        return {
            scale: scaleFactor,
            position: new THREE.Vector3(
                -center.x * scaleFactor,
                -center.y * scaleFactor, // center perfectly
                -center.z * scaleFactor
            )
        };
    }, [fbx]);

    return (
        <group ref={groupRef}>
            <group scale={[scale, scale, scale]} position={[position.x, position.y - 0.5, position.z]}>
                <primitive object={fbx} />
            </group>
        </group>
    );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: any) {
        console.warn('Twin3D: Failed to load external model, using fallback.', error);
    }
    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

export const Twin3D: React.FC = () => {
    const { personalDetails } = useHealthTwinStore();
    const isFemale = personalDetails?.gender?.toLowerCase() === 'female' || personalDetails?.gender?.toLowerCase() === 'f';
    const currentModelUrl = isFemale ? FEMALE_MODEL_URL : MALE_MODEL_URL;

    // Transparent canvas to seamlessly match the #F5F2EB page background
    return (
        <div className="w-full h-full relative" style={{ background: 'transparent' }}>
            <Canvas
                camera={{ position: [0, 1, 6], fov: 50 }}
                className="w-full h-full"
                style={{ background: 'transparent' }}
                gl={{ alpha: true }}
            >
                {/* Lighting tuned for the beige page background */}
                <ambientLight intensity={0.6} color="#ffffff" />
                <directionalLight position={[10, 10, 5]} intensity={1.2} color="#ffffff" />
                <directionalLight position={[-5, 5, -5]} intensity={0.4} color="#b0c4de" />
                <spotLight position={[0, 10, 0]} intensity={0.8} color="#ffffff" penumbra={1} angle={0.5} />

                {/* External FBX model with fallback */}
                <ErrorBoundary fallback={<FallbackHuman />}>
                    <Suspense fallback={<FallbackHuman />}>
                        <FBXModel url={currentModelUrl} />
                    </Suspense>
                </ErrorBoundary>

                <Environment preset="studio" />

                {/* Subtle contact shadow */}
                <ContactShadows position={[0, -2.5, 0]} opacity={0.2} scale={8} blur={2.5} far={4} color="#2C2A26" />

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
