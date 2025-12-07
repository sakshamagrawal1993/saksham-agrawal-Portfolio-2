import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRunnerStore } from './store';
import Player from './Player';
import Track from './Track';
import ObstacleManager from './ObstacleManager';

const Game = () => {
    const { speed, incrementDistance, addScore } = useRunnerStore();

    // Game loop updates
    useFrame((state, delta) => {
        // Increment distance traveled based on speed and time
        incrementDistance(speed * delta);
        // Add score passively for survival/distance
        addScore(speed * delta * 0.1);
    });

    return (
        <>
            <Player />
            <Track />
            <ObstacleManager />
        </>
    );
};

export default Game;
