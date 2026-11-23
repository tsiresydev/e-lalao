import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const pips: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
// BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
const faces = [3, 4, 2, 5, 1, 6];
const rotations: Record<number, [number, number]> = {
  1: [0, 0], 2: [Math.PI / 2, 0], 3: [0, -Math.PI / 2],
  4: [0, Math.PI / 2], 5: [-Math.PI / 2, 0], 6: [0, Math.PI],
};

export default function LudoDice3D({ value, rolling, onReady }: {
  value: number | null; rolling: boolean; onReady: (ready: boolean) => void;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const props = useRef({ value, rolling, onReady });
  props.current = { value, rolling, onReady };
  const renderCurrent = useRef<() => void>(() => {});

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch { props.current.onReady(false); return; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 20);
    camera.position.set(2.7, 2.8, 7.6);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff8e6, 0x627269, 2));
    const light = new THREE.DirectionalLight(0xffebca, 2.6);
    light.position.set(-3, 6, 6);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xdbeaf0, .7);
    fill.position.set(4, 1, -2);
    scene.add(fill);
    const textures = faces.map(face => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const ivory = ctx.createLinearGradient(0, 0, 256, 256);
        ivory.addColorStop(0, '#fffdf5'); ivory.addColorStop(.55, '#f4eddc'); ivory.addColorStop(1, '#e4dbc6');
        ctx.fillStyle = ivory; ctx.fillRect(0, 0, 256, 256);
        for (const pip of pips[face]) {
          const px = 60 + (pip % 3) * 68, py = 60 + Math.floor(pip / 3) * 68;
          // A soft rim and offset highlight suggest an inset rather than a printed dot.
          ctx.fillStyle = '#fffaf0';
          ctx.beginPath();
          ctx.arc(px, py + 2, 19, 0, Math.PI * 2);
          ctx.fill();
          const inset = ctx.createRadialGradient(px - 5, py - 6, 2, px, py, 17);
          inset.addColorStop(0, '#5c665e'); inset.addColorStop(.65, '#26352e'); inset.addColorStop(1, '#182721');
          ctx.fillStyle = inset;
          ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
    const materials = textures.map(map => new THREE.MeshStandardMaterial({ map, roughness: .46, metalness: 0 }));
    const geometry = new RoundedBoxGeometry(2, 2, 2, 5, .18);
    const die = new THREE.Mesh(geometry, materials);
    scene.add(die);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(64, 64, 4, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(16,30,24,0.48)');
      gradient.addColorStop(1, 'rgba(16,30,24,0)');
      shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: .65 });
    const shadowGeometry = new THREE.PlaneGeometry(3.8, 3.8);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.45;
    scene.add(shadow);
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(100, 100, false);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    let frame = 0;
    let alive = true;
    let started = 0;
    const render = (now: number) => {
      if (!alive || document.hidden) return;
      const { value: current, rolling: active } = props.current;
      const [x, y] = rotations[current ?? 1] ?? rotations[1];
      if (active && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (!started) started = now;
        const progress = Math.min((now - started) / 550, 1);
        const remaining = Math.pow(1 - progress, 2);
        die.rotation.set(x + remaining * Math.PI * 4, y + remaining * Math.PI * 6, remaining * .35);
        die.position.y = Math.sin(progress * Math.PI) * .32;
        shadowMaterial.opacity = .65 - Math.sin(progress * Math.PI) * .25;
      } else {
        started = 0;
        die.rotation.set(x, y, 0);
        die.position.y = 0;
        shadowMaterial.opacity = .65;
      }
      renderer.render(scene, camera);
      if (active) frame = requestAnimationFrame(render);
    };
    const redraw = () => { cancelAnimationFrame(frame); if (!document.hidden) frame = requestAnimationFrame(render); };
    renderCurrent.current = redraw;
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(frame); else redraw(); };
    const onContextLost = (event: Event) => { event.preventDefault(); alive = false; cancelAnimationFrame(frame); props.current.onReady(false); };
    document.addEventListener('visibilitychange', onVisibility);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    redraw();
    props.current.onReady(true);
    return () => {
      alive = false;
      renderCurrent.current = () => {};
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      textures.forEach(texture => texture.dispose());
      materials.forEach(material => material.dispose());
      geometry.dispose(); shadowGeometry.dispose(); shadowMaterial.dispose(); shadowTexture.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => { renderCurrent.current(); }, [value, rolling]);
  return <span ref={host} className="ludo-dice-3d" aria-hidden="true"/>;
}
