
'use client'

import { Suspense, lazy } from 'react'
import { ErrorBoundary } from './error-boundary';

const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
    scene: string
    className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
    return (
        <ErrorBoundary fallback={<div className="w-full h-full flex items-center justify-center text-xs text-gray-400">3D Model Failed</div>}>
            <Suspense
                fallback={
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="loader border-gray-400 border-b-transparent"></span>
                    </div>
                }
            >
                <Spline
                    scene={scene}
                    className={className}
                />
            </Suspense>
        </ErrorBoundary>
    )
}
