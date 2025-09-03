import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF, Html, Text } from '@react-three/drei';
import { XR, createXRStore, XRHitTest, useXR, ShowIfSessionVisible } from '@react-three/xr';
import * as THREE from 'three';

const store = createXRStore({
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay']
});

const WheelModel = React.forwardRef(function WheelModel({ onWheelChildFound, ...props }, ref) {
  const gltf = useGLTF('./wheel.glb');
  
  // Find the wheel child and pass it via callback, but keep scene ref for positioning
  React.useEffect(() => {
    if (gltf.scene && onWheelChildFound) {
      console.log('Model loaded, finding wheel child');
      console.log('Scene children:', gltf.scene.children.map(child => ({ name: child.name, type: child.type })));
      
      // Try to find the wheel child by name
      let wheelChild = gltf.scene.getObjectByName('wheel') || 
                      gltf.scene.getObjectByName('Wheel') ||
                      gltf.scene.children.find(child => 
                        child.name.toLowerCase().includes('wheel')
                      );
      
      if (wheelChild) {
        console.log('Found wheel child:', wheelChild.name, wheelChild.type);
        onWheelChildFound(wheelChild);
      } else {
        console.log('No wheel child found, using entire scene for rotation');
        onWheelChildFound(gltf.scene);
      }
    }
  }, [gltf.scene, onWheelChildFound]);
  
  return <primitive ref={ref} object={gltf.scene} {...props} />;
});
useGLTF.preload('./wheel.glb');

function ARWheel({ predefinedReward }) {
  const sceneRef = useRef(); // For positioning the entire model
  const wheelChildRef = useRef(); // For rotating just the wheel part
  const spinningRef = useRef(false);
  const targetRotationRef = useRef(0);
  const [wheelPosition, setWheelPosition] = useState(null);
  const [isPlaced, setIsPlaced] = useState(false);
  const [currentReward, setCurrentReward] = useState(null);
  const [showReward, setShowReward] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);

  // Define the 8 rewards based on the wheel segments (0-7, counter-clockwise from top)
  // The pointer is at the top, so index 0 is the segment the pointer points to
  // When wheel rotates counter-clockwise, the mapping changes
  const rewards = [
    "Gracias por participar",           // 0 - Top (pink) - pointer points here
    "Giro Extra",                      // 1 - Teal (top-left) - counter-clockwise from top
    "Kit de productos Softys",         // 2 - Pink (left)
    "Tarjeta de regalo $200",          // 3 - Orange (bottom-left)
    "Kit de productos Softys",         // 4 - Teal (bottom)
    "Giro Extra",                      // 5 - Pink (bottom-right)
    "Gracias por participar",          // 6 - Teal (right)
    "Tarjeta de regalo $500"           // 7 - Orange (top-right)
  ];
  // Auto-place wheel after timeout if hit test doesn't work
  React.useEffect(() => {
    if (!isPlaced) {
      const autoPlaceTimer = setTimeout(() => {
        if (!isPlaced) {
          setWheelPosition(new THREE.Vector3(0, 0, -2));
          setIsPlaced(true);
        }
      }, 3000); // Auto-place after 3 seconds
      
      return () => clearTimeout(autoPlaceTimer);
    }
  }, [isPlaced]);

  // Hit test callback function
  const handleHitTestResults = React.useCallback((results, getWorldMatrix) => {
    if (!isPlaced && results && results.length > 0) {
      // Get world matrix from first hit result
      const matrixHelper = new THREE.Matrix4();
      getWorldMatrix(matrixHelper, results[0]);
      
      // Extract position from matrix
      const position = new THREE.Vector3();
      position.setFromMatrixPosition(matrixHelper);
      
      setWheelPosition(position);
      setIsPlaced(true);
    }
  }, [isPlaced]);

  // Callback to receive the wheel child from WheelModel
  const handleWheelChildFound = React.useCallback((wheelChild) => {
    wheelChildRef.current = wheelChild;
  }, []);

  // Place wheel at hit test position when both scene ref and position are available
  React.useEffect(() => {
    const checkAndPlace = () => {
      if (!sceneRef.current || !wheelPosition) {
        setTimeout(checkAndPlace, 100);
        return;
      }
      // Position the entire scene at hit test position
      sceneRef.current.position.copy(wheelPosition);
      sceneRef.current.quaternion.identity();
      sceneRef.current.scale.set(8, 8, 8);
      sceneRef.current.visible = true;
    };
    
    // Start checking after a short delay
    setTimeout(checkAndPlace, 100);
  }, [wheelPosition]); // Now depends on wheelPosition

  const startSpin = () => {
    if (spinningRef.current || hasSpun) {
      return;
    }
    
    if (!wheelChildRef.current) {
      return;
    }
    
    // Hide previous reward if shown
    setShowReward(false);
    setCurrentReward(null);
    
    spinningRef.current = true;
    setHasSpun(true);
    const idx = predefinedReward ?? Math.floor(Math.random() * 8);
    const baseSpins = 10; // Doubled from 5 to 10 for twice as long spin
    
    // Calculate the correct target angle for the reward
    // Each segment is 45 degrees, and we need to account for counter-clockwise rotation
    const targetAngle = -(idx * 45) * (Math.PI / 180);
    const currentRotation = wheelChildRef.current.rotation.y || 0;
    targetRotationRef.current = currentRotation + (baseSpins * Math.PI * 2) + targetAngle;
    
    // Set the reward that will be shown after spin
    setCurrentReward({
      index: idx,
      text: rewards[idx]
    });
  };

  // Spin animation loop
  useFrame(() => {
    if (spinningRef.current && wheelChildRef.current) {
      const current = wheelChildRef.current.rotation.y;
      const remaining = targetRotationRef.current - current;
      if (Math.abs(remaining) > 0.002) { // Smaller threshold for smoother stop
        // Slower speed: reduced from 0.08 to 0.048 (40% slower)
        // Better easing with minimum speed
        const step = Math.sign(remaining) * Math.max(0.006, Math.abs(remaining) * 0.048);
        wheelChildRef.current.rotation.y += step;
      } else {
        wheelChildRef.current.rotation.y = targetRotationRef.current;
        
        // Show reward after spin completes
        setTimeout(() => {
          setShowReward(true);
          // Reset spinning state to allow another spin
          spinningRef.current = false;
        }, 500); // Small delay for dramatic effect
      }
    }
  });



  // Only render wheel and button if position is set
  if (!wheelPosition) {
    return (
      <>
        <ambientLight intensity={1.2} />
        <Environment preset="city" />
        {/* XRHitTest component for floor detection */}
        <XRHitTest onResults={handleHitTestResults} />
        {/* Simple placement message */}
        <Text
          position={[0, 0, -1]}
          fontSize={0.06}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          Placing Spin wheel in your space
        </Text>
      </>
    );
  }

  return (
    <>
      <WheelModel ref={sceneRef} onWheelChildFound={handleWheelChildFound} />
      
      {/* Reward Display - positioned above the wheel */}
      {showReward && currentReward && (
        <group position={[wheelPosition.x, wheelPosition.y + 1.8, wheelPosition.z]}>
          {/* Reward background */}
          <mesh>
            <boxGeometry args={[1.2, 0.48, 0.06]} />
            <meshStandardMaterial color="#FFD700" />
          </mesh>
          {/* Reward border */}
          <mesh position={[0, 0, 0.006]}>
            <boxGeometry args={[1.26, 0.54, 0.03]} />
            <meshStandardMaterial color="#FF6B35" />
          </mesh>
          {/* Reward text */}
          <Text
            position={[0, 0.06, 0.036]}
            fontSize={0.032}
            color="#333333"
            anchorX="center"
            anchorY="middle"
            maxWidth={1.15}
            font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          >
            🎉 ¡Felicitaciones! 🎉
          </Text>
          <Text
            position={[0, -0.06, 0.036]}
            fontSize={0.04}
            color="#333333"
            anchorX="center"
            anchorY="middle"
            maxWidth={1.15}
            font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          >
            {currentReward.text}
          </Text>
          {/* Close button */}
          <mesh 
            position={[0.54, 0.18, 0.036]}
            onClick={() => setShowReward(false)}
          >
            <boxGeometry args={[0.12, 0.12, 0.03]} />
            <meshStandardMaterial color="#ff4444" />
          </mesh>
          <Text
            position={[0.54, 0.18, 0.048]}
            fontSize={0.024}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            ✕
          </Text>
        </group>
      )}
      
      {/* 3D Spin Button positioned relative to wheel position (only show if not spun) */}
      {!hasSpun && (
        <group 
          position={[
            wheelPosition.x, 
            wheelPosition.y - 0.05, 
            wheelPosition.z + 0.2
          ]} 
          onClick={startSpin} 
          onPointerDown={startSpin}
        >
          <mesh>
            <boxGeometry args={[1, 0.3, 0.1]} />
            <meshStandardMaterial color="#ff6b6b" />
          </mesh>
          {/* 3D Text on the button */}
          <Text
            position={[0, 0, 0.06]}
            fontSize={0.08}
            color="white"
            anchorX="center"
            anchorY="middle"
            font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          >
            SPIN
          </Text>
        </group>
      )}
      <ambientLight intensity={1.2} />
      <Environment preset="city" />
    </>
  );
}

function App() {
  const [isArButtonTapped, setIsArButtonTapped] = useState(false);
  
  const rewardParam = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('rewardId');
    if (p === null) return null;
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 && n <= 7 ? n : null;
  }, []);

  const enterAR = () => {
    setIsArButtonTapped(true);
    store.enterAR();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'fixed', inset: 0 }}>
      {/* Centered AR button overlay, keep wheel visible underneath */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          pointerEvents: 'none'
        }}
      >
        <button
          onClick={enterAR}
          style={{
            pointerEvents: 'auto',
            padding: '18px 48px',
            background: 'linear-gradient(45deg, #4CAF50, #45a049)',
            color: '#fff',
            border: 'none',
            borderRadius: 28,
            fontWeight: 700,
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(76,175,80,0.45)'
          }}
        >
          Enter AR
        </button>
      </div>

      <Canvas camera={{ position: [0, 1, 2], fov: 60 }}>
        <XR store={store}>
          <Suspense fallback={null}>
            {isArButtonTapped && (
              <ARWheel predefinedReward={rewardParam ?? undefined} />
            )}
          </Suspense>
        </XR>
      </Canvas>
    </div>
  );
}

export default App;
