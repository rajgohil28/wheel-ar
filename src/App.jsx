import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF, OrbitControls, Html } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import * as THREE from 'three';

const store = createXRStore();

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

  // Callback to receive the wheel child from WheelModel
  const handleWheelChildFound = React.useCallback((wheelChild) => {
    wheelChildRef.current = wheelChild;
    console.log('Wheel child ref set to:', wheelChild);
  }, []);

  // Place wheel at origin when scene ref is available
  React.useEffect(() => {
    const checkAndPlace = () => {
      if (!sceneRef.current) {
        console.log('sceneRef.current is still null, retrying...');
        setTimeout(checkAndPlace, 100);
        return;
      }
      console.log('Placing wheel scene at origin, ref:', sceneRef.current);
      // Position the entire scene at origin
      sceneRef.current.position.set(0, 0, 0);
      sceneRef.current.quaternion.identity();
      sceneRef.current.scale.set(1, 1, 1);
      sceneRef.current.visible = true;
    };
    
    // Start checking after a short delay
    setTimeout(checkAndPlace, 100);
  }, []);

  const startSpin = () => {
    console.log('startSpin called');
    console.log('wheelChildRef.current:', wheelChildRef.current);
    console.log('spinningRef.current:', spinningRef.current);
    
    if (spinningRef.current) {
      console.log('Already spinning, ignoring');
      return;
    }
    
    if (!wheelChildRef.current) {
      console.log('No wheel child ref, cannot spin');
      return;
    }
    
    spinningRef.current = true;
    const idx = predefinedReward ?? Math.floor(Math.random() * 8);
    const baseSpins = 5; // Increased from 3 to 5 for longer spin
    const targetAngle = -(idx * 45) * (Math.PI / 180);
    const currentRotation = wheelChildRef.current.rotation.y || 0;
    targetRotationRef.current = currentRotation + (-(baseSpins * Math.PI * 2) + targetAngle);
    
    console.log('Starting spin to reward index:', idx);
    console.log('Current rotation:', currentRotation);
    console.log('Target rotation:', targetRotationRef.current);
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
        // Only log occasionally to avoid spam
        if (Math.random() < 0.01) {
          console.log('Spinning - current:', current, 'target:', targetRotationRef.current, 'remaining:', remaining);
        }
      } else {
        wheelChildRef.current.rotation.y = targetRotationRef.current;
        spinningRef.current = false;
        console.log('Spin complete at rotation:', targetRotationRef.current);
      }
    }
  });

  return (
    <>
      <WheelModel ref={sceneRef} onWheelChildFound={handleWheelChildFound} />
      {/* Overlay HTML Spin Button for desktop preview */}
      <Html prepend zIndexRange={[100, 0]}>
        <button
          onClick={startSpin}
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ff6b6b',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 20px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 1000
          }}
        >
          SPIN
        </button>
      </Html>
      <ambientLight intensity={1.2} />
      <Environment preset="city" />
    </>
  );
}

function App() {
  const rewardParam = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('rewardId');
    if (p === null) return null;
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 && n <= 7 ? n : null;
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'fixed', inset: 0 }}>
      <Canvas camera={{ position: [0, 1, 2], fov: 60 }}>
        <Suspense fallback={null}>
          <ARWheel predefinedReward={rewardParam ?? undefined} />
        </Suspense>
        <OrbitControls enableDamping={false} />
      </Canvas>
    </div>
  );
}

export default App;
