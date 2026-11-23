import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** Temporary visual overlay only; it never owns or modifies game state. */
export default function VictoryCelebration({ onComplete }: { onComplete: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      complete.current();
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      complete.current();
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.z = 2;
    const count = window.innerWidth < 600 ? 36 : 64;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const drift = new Float32Array(count);
    const palette = ['#e7c479', '#d0a95f', '#a6bd86', '#f5e6bc'];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() * 2 - 1;
      positions[i * 3 + 1] = 1 + Math.random() * 1.6;
      const color = new THREE.Color(palette[i % palette.length]);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      speed[i] = .3 + Math.random() * .35;
      drift[i] = (Math.random() - .5) * .22;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
    scene.add(new THREE.Points(geometry, material));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    const resize = () => renderer.setSize(container.clientWidth, container.clientHeight, false);
    resize();
    window.addEventListener('resize', resize);
    let frame = 0;
    let done = false;
    let last = performance.now();
    const started = last;
    const finish = () => { if (!done) { done = true; complete.current(); } };
    const contextLost = (event: Event) => { event.preventDefault(); finish(); };
    const visibility = () => { if (document.hidden) finish(); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibility);
    const render = (now: number) => {
      if (done) return;
      const delta = Math.min((now - last) / 1000, .05);
      last = now;
      const elapsed = (now - started) / 1000;
      if (elapsed >= 3) { finish(); return; }
      for (let i = 0; i < count; i++) {
        positions[i * 3] += drift[i] * delta;
        positions[i * 3 + 1] -= speed[i] * delta;
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = Math.min(1, (3 - elapsed) * 1.5);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometry.dispose(); material.dispose(); renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={host} className="victory-celebration" aria-hidden="true"/>;
}
