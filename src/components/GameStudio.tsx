import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gamepad2,
  Play,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  Sliders,
  Cpu,
  Check,
  Boxes,
  FileCode,
  Terminal,
  Wrench,
  Sparkles,
  PlusCircle,
  Volume2,
  Layers,
  ArrowRight,
  ChevronRight,
  Database,
  Eye,
  Settings,
  Flame,
  Layout,
  Clock,
  AlertTriangle,
  FolderKanban,
  Wand2
} from 'lucide-react';
import { useAppContext } from '../AppContext';

// ==========================================
// Web Audio API Synthesizer helpers
// ==========================================
const playSynthSound = (type: 'coin' | 'lava' | 'win' | 'build' | 'node') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (type === 'coin') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'lava') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'win') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(261.63, ctx.currentTime); // C4
      osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.1); // E4
      osc.frequency.setValueAtTime(392.00, ctx.currentTime + 0.2); // G4
      osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.3); // C5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === 'build') {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.8);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc2.start();
      osc.stop(ctx.currentTime + 0.8);
      osc2.stop(ctx.currentTime + 0.8);
    } else if (type === 'node') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {
    // Audio Context blocked by policy or unsupported
  }
};

// ==========================================
// 3D Geometry generation math
// ==========================================
type Point3D = [number, number, number];
type Face = number[];

function generateCube(): { vertices: Point3D[]; faces: Face[] } {
  const vertices: Point3D[] = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
  ];
  const faces = [
    [0, 1, 2, 3], // back
    [1, 5, 6, 2], // right
    [5, 4, 7, 6], // front
    [4, 0, 3, 7], // left
    [3, 2, 6, 7], // top
    [1, 0, 4, 5]  // bottom
  ];
  return { vertices, faces };
}

function generatePyramid(): { vertices: Point3D[]; faces: Face[] } {
  const vertices: Point3D[] = [
    [0, 1, 0], // apex
    [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1] // base
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], // sides
    [4, 3, 2, 1] // base
  ];
  return { vertices, faces };
}

function generateTorus(R = 1.0, r = 0.4, radialSegments = 16, tubularSegments = 16): { vertices: Point3D[]; faces: Face[] } {
  const vertices: Point3D[] = [];
  const faces: Face[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    const theta = (j * 2 * Math.PI) / radialSegments;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let i = 0; i <= tubularSegments; i++) {
      const phi = (i * 2 * Math.PI) / tubularSegments;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const x = (R + r * cosTheta) * cosPhi;
      const y = (R + r * cosTheta) * sinPhi;
      const z = r * sinTheta;
      vertices.push([x, y, z]);
    }
  }

  for (let j = 0; j < radialSegments; j++) {
    for (let i = 0; i < tubularSegments; i++) {
      const first = j * (tubularSegments + 1) + i;
      const second = first + tubularSegments + 1;
      // create two triangles for torus quad face
      faces.push([first, second, first + 1]);
      faces.push([second, second + 1, first + 1]);
    }
  }

  return { vertices, faces };
}

function generateStar(): { vertices: Point3D[]; faces: Face[] } {
  const vertices: Point3D[] = [
    [0, 0, 0.8], // top center
    [0, 0, -0.8], // bottom center
  ];
  const outerPoints = 5;
  const rOuter = 1.0;
  const rInner = 0.4;

  for (let i = 0; i < outerPoints * 2; i++) {
    const angle = (i * Math.PI) / outerPoints;
    const r = i % 2 === 0 ? rOuter : rInner;
    vertices.push([Math.cos(angle) * r, Math.sin(angle) * r, 0]);
  }

  const faces: Face[] = [];
  const ptCount = outerPoints * 2;
  
  for (let i = 0; i < ptCount; i++) {
    const nextIdx = (i + 1) % ptCount;
    // top cap faces
    faces.push([0, i + 2, nextIdx + 2]);
    // bottom cap faces
    faces.push([1, nextIdx + 2, i + 2]);
  }
  return { vertices, faces };
}

// ==========================================
// Main Component
// ==========================================
export default function GameStudio() {
  const { theme } = useAppContext();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor' | 'nodes' | 'forge' | 'shader' | 'kanban' | 'build'>('dashboard');

  const accentColor = useMemo(() => {
    switch (theme) {
      case 'midnight-ocean': return 'text-cyan-400 border-cyan-500/30';
      case 'forest-terminal': return 'text-emerald-400 border-emerald-500/30';
      case 'neon-cyber': return 'text-fuchsia-400 border-fuchsia-500/30';
      case 'amber-console': return 'text-amber-500 border-amber-500/30';
      case 'rose-quartz': return 'text-pink-500 border-pink-500/30';
      default: return 'text-amber-400 border-amber-500/30';
    }
  }, [theme]);

  return (
    <div className="flex-1 h-full w-full flex flex-col bg-[#110e10]/40 backdrop-blur-md overflow-hidden relative">
      {/* Studio Header */}
      <header className="px-6 py-4 border-b border-white/[0.04] bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/10">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              Game Studio Workspace
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/25">
                v2.5 Beta
              </span>
            </h1>
            <p className="text-xs text-zinc-500">Integrierte Spiel-Engine & CodeForge-Entwicklungsstudio</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 custom-scrollbar max-w-full">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Cpu },
            { id: 'editor', label: 'Level-Editor', icon: Play },
            { id: 'nodes', label: 'Visual Scripting', icon: Boxes },
            { id: 'forge', label: '3D Forge', icon: Wand2 },
            { id: 'shader', label: 'Shader Lab', icon: Flame },
            { id: 'kanban', label: 'Kanban', icon: FolderKanban },
            { id: 'build', label: 'Build & Deploy', icon: Terminal }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  playSynthSound('node');
                }}
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200 shrink-0 ${
                  active
                    ? 'bg-white/10 text-white border border-white/10 shadow-md'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? accentColor : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
                {active && (
                  <motion.div
                    layoutId="activeStudioTabIndicator"
                    className="absolute -bottom-[5px] left-2 right-2 h-[2px] bg-amber-400 rounded-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Tab Workspace Content */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            className="w-full h-full p-6 overflow-y-auto custom-scrollbar"
          >
            {activeTab === 'dashboard' && <StudioDashboard accentColor={accentColor} />}
            {activeTab === 'editor' && <StudioLevelEditor />}
            {activeTab === 'nodes' && <StudioVisualScripting />}
            {activeTab === 'forge' && <Studio3DForge />}
            {activeTab === 'shader' && <StudioShaderLab />}
            {activeTab === 'kanban' && <StudioKanbanBoard />}
            {activeTab === 'build' && <StudioBuildCenter />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ==========================================
// 1. Dashboard Sub-component
// ==========================================
function StudioDashboard({ accentColor }: { accentColor: string }) {
  const [telemetry, setTelemetry] = useState({
    fps: 60,
    drawCalls: 124,
    vram: 0.72,
    ram: 1.45,
    gpuLoad: 42
  });

  // Smooth dynamic telemetry simulations
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry(prev => ({
        fps: Math.round(58.5 + Math.random() * 3),
        drawCalls: 120 + Math.round(Math.random() * 8),
        vram: Number((0.71 + Math.random() * 0.02).toFixed(2)),
        ram: Number((1.42 + Math.random() * 0.05).toFixed(2)),
        gpuLoad: Math.round(38 + Math.random() * 8)
      }));
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  const stats = [
    { label: 'WebGL FPS', value: `${telemetry.fps} FPS`, color: 'text-emerald-400' },
    { label: 'Draw Calls', value: telemetry.drawCalls, color: 'text-sky-400' },
    { label: 'System RAM', value: `${telemetry.ram} GB`, color: 'text-purple-400' },
    { label: 'GPU Auslastung', value: `${telemetry.gpuLoad}%`, color: 'text-pink-400' }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left side: Telemetry & Config */}
      <div className="xl:col-span-2 space-y-6">
        <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white tracking-wider uppercase flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Live Live-Systemdiagnose
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/5 px-2 py-0.5 rounded border border-emerald-400/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Empfangend
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {stats.map((s, idx) => (
              <div key={idx} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-center">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{s.label}</span>
                <span className={`text-xl font-bold mt-1 font-mono ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Performance chart visualization */}
          <div className="h-44 flex flex-col justify-between bg-black/25 border border-white/5 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between z-10 text-[11px] text-zinc-400 font-mono">
              <span>FPS Stabilität (Letzte 60 Sek.)</span>
              <span className="text-emerald-400">Optimal (60hz)</span>
            </div>
            
            {/* Fake SVG Graph Line */}
            <div className="w-full h-24 flex items-end">
              <svg className="w-full h-full text-amber-500/20" viewBox="0 0 100 30" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(245, 158, 11)" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="rgb(245, 158, 11)" stopOpacity="0.0"/>
                  </linearGradient>
                </defs>
                <path
                  d="M0,20 Q10,18 20,21 T40,19 T60,22 T80,18 T100,20 L100,30 L0,30 Z"
                  fill="url(#chartGrad)"
                />
                <path
                  d="M0,20 Q10,18 20,21 T40,19 T60,22 T80,18 T100,20"
                  fill="none"
                  stroke="rgb(245, 158, 11)"
                  strokeWidth="0.8"
                />
              </svg>
            </div>
            <div className="flex justify-between items-center text-[9px] text-zinc-600 font-mono z-10">
              <span>60s ago</span>
              <span>30s ago</span>
              <span>Live</span>
            </div>
          </div>
        </div>

        {/* Engine and Project Settings */}
        <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Projekt-Informationen</h3>
            <table className="w-full text-xs text-zinc-400">
              <tbody>
                <tr className="border-b border-white/5"><td className="py-2.5 font-medium text-zinc-500">Titel:</td><td className="py-2.5 text-white font-semibold">Project-Forge (Neon)</td></tr>
                <tr className="border-b border-white/5"><td className="py-2.5 font-medium text-zinc-500">Engine:</td><td className="py-2.5 text-zinc-300">CodeForge WebGL engine</td></tr>
                <tr className="border-b border-white/5"><td className="py-2.5 font-medium text-zinc-500">Plattform:</td><td className="py-2.5 text-zinc-300">Cross-Platform Web/Android</td></tr>
                <tr><td className="py-2.5 font-medium text-zinc-500">Letzter Build:</td><td className="py-2.5 text-amber-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> vor 10 Min.</td></tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">Engine-Fokus & Features</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Konfiguriert für Hochleistungs-Pixelart und prozedurale Geometrie. Integrierte Shader Lab Unterstützung für Post-Processing Shader, Custom Shaders & 3D Vertices Transformationen.
              </p>
            </div>
            <div className="mt-4 p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-3 text-xs text-zinc-400">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Optimierungs-Warnung: Texturen-Kompression auf Brotli empfohlen für Web-Builds.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Studio Action Centers */}
      <div className="space-y-6">
        {/* Quick action card */}
        <div className="panel bg-gradient-to-br from-zinc-900 to-black border border-white/[0.06] p-5 rounded-2xl flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Asset Forge Pro
            </div>
            <h3 className="text-base font-bold text-white">Generiere prozedurale Assets</h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Erstelle 3D-Modelle oder Shader in Sekunden. Nutze mathematische Projektionen im Forge-Tab, um Geometriedaten direkt als JSON für deine Web-Anwendung zu exportieren.
            </p>
          </div>
          <button className="mt-4 w-full bg-white hover:bg-zinc-200 text-black text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-white/5">
            Jetzt ausprobieren
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Resources / Assets count */}
        <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-500" />
            Aktive Projekt-Ressourcen
          </h3>
          <div className="space-y-3.5">
            {[
              { type: 'Skripte', count: '14 Dateien', size: '124 KB', pct: 60, color: 'bg-amber-400' },
              { type: 'Sprites / Texturen', count: '28 Assets', size: '3.4 MB', pct: 85, color: 'bg-emerald-400' },
              { type: '3D Meshes', count: '4 Modelle', size: '280 KB', pct: 30, color: 'bg-pink-400' },
              { type: 'Audiodateien', count: '6 Sounds', size: '1.2 MB', pct: 45, color: 'bg-blue-400' }
            ].map((res, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300 font-medium">{res.type}</span>
                  <span className="text-zinc-500 font-mono">{res.count} ({res.size})</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                  <div className={`h-full ${res.color} rounded-full`} style={{ width: `${res.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. Playable Level Editor Sub-component
// ==========================================
type TileType = 'empty' | 'wall' | 'player' | 'coin' | 'lava' | 'goal';

const TILE_CONFIG: Record<TileType, { label: string; color: string; border: string; labelColor: string }> = {
  empty: { label: 'Empty', color: 'bg-transparent', border: 'border-white/5', labelColor: 'text-zinc-600' },
  wall: { label: 'Wall', color: 'bg-zinc-800 border-zinc-700', border: 'border-zinc-600', labelColor: 'text-zinc-300' },
  player: { label: 'Player', color: 'bg-emerald-500 shadow-md shadow-emerald-500/20 rounded-full scale-90 border-2 border-emerald-400', border: 'border-emerald-500', labelColor: 'text-emerald-400' },
  coin: { label: 'Coin', color: 'bg-yellow-400 shadow-md shadow-yellow-400/30 rounded-full scale-75 animate-pulse border-2 border-yellow-300', border: 'border-yellow-400', labelColor: 'text-yellow-400' },
  lava: { label: 'Lava', color: 'bg-gradient-to-r from-red-600 to-orange-600 animate-pulse border-red-500', border: 'border-red-600', labelColor: 'text-red-400' },
  goal: { label: 'Goal', color: 'bg-purple-600 shadow-md shadow-purple-600/20 border-2 border-purple-400 scale-95 rotate-45', border: 'border-purple-500', labelColor: 'text-purple-400' }
};

function StudioLevelEditor() {
  const ROWS = 9;
  const COLS = 12;

  // Initialize a default level grid
  const [grid, setGrid] = useState<TileType[][]>(() => {
    const baseGrid = Array(ROWS).fill(null).map(() => Array(COLS).fill('empty' as TileType));
    // Set starting items
    baseGrid[1][1] = 'player';
    baseGrid[1][4] = 'wall';
    baseGrid[2][4] = 'wall';
    baseGrid[3][4] = 'wall';
    baseGrid[4][4] = 'wall';
    baseGrid[5][4] = 'wall';
    
    baseGrid[2][2] = 'coin';
    baseGrid[4][2] = 'coin';
    baseGrid[7][2] = 'coin';

    baseGrid[3][6] = 'lava';
    baseGrid[4][6] = 'lava';
    baseGrid[5][6] = 'lava';
    baseGrid[6][6] = 'lava';

    baseGrid[7][10] = 'coin';
    baseGrid[2][10] = 'goal';
    
    return baseGrid;
  });

  const [selectedTool, setSelectedTool] = useState<TileType>('wall');
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);

  // Keep track of the active player position in state when playing
  const [playerPos, setPlayerPos] = useState({ r: 1, c: 1 });
  // Map representation during play (we copy grid)
  const [playGrid, setPlayGrid] = useState<TileType[][]>([]);

  // Sound triggering helper
  const triggerSound = (type: 'coin' | 'lava' | 'win') => {
    playSynthSound(type);
  };

  // Start Playing Test
  const startPlayTest = () => {
    // Find player position in design grid
    let pr = 1, pc = 1;
    let found = false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === 'player') {
          pr = r;
          pc = c;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    // copy grid
    const copy = grid.map(row => [...row]);
    setPlayGrid(copy);
    setPlayerPos({ r: pr, c: pc });
    setScore(0);
    setMoves(0);
    setGameResult(null);
    setIsPlaying(true);
    triggerSound('coin');
  };

  // Stop Play Test / Reset to editor mode
  const stopPlayTest = () => {
    setIsPlaying(false);
    setGameResult(null);
  };

  // Click handler for drawing tiles
  const handleCellClick = (r: number, c: number) => {
    if (isPlaying) return;
    const newGrid = grid.map(row => [...row]);
    
    // If painting player, remove player from elsewhere first
    if (selectedTool === 'player') {
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (newGrid[row][col] === 'player') {
            newGrid[row][col] = 'empty';
          }
        }
      }
    }

    newGrid[r][c] = newGrid[r][c] === selectedTool ? 'empty' : selectedTool;
    setGrid(newGrid);
    playSynthSound('node');
  };

  // Clear entire grid
  const clearGrid = () => {
    setGrid(Array(ROWS).fill(null).map(() => Array(COLS).fill('empty')));
    setGameResult(null);
  };

  // Gameplay controls: WASD / Arrows
  const movePlayer = useCallback((dr: number, dc: number) => {
    if (!isPlaying || gameResult) return;
    
    const nr = playerPos.r + dr;
    const nc = playerPos.c + dc;

    // Check bounds
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;

    // Check Wall
    const targetTile = playGrid[nr][nc];
    if (targetTile === 'wall') return;

    // Update grid
    const nextGrid = playGrid.map(row => [...row]);
    nextGrid[playerPos.r][playerPos.c] = 'empty';
    
    let newScore = score;
    let nextResult = gameResult;

    if (targetTile === 'coin') {
      newScore += 100;
      triggerSound('coin');
    } else if (targetTile === 'lava') {
      nextResult = 'lost';
      triggerSound('lava');
    } else if (targetTile === 'goal') {
      nextResult = 'won';
      triggerSound('win');
    }

    nextGrid[nr][nc] = 'player';
    setPlayGrid(nextGrid);
    setPlayerPos({ r: nr, c: nc });
    setScore(newScore);
    setMoves(prev => prev + 1);
    if (nextResult) {
      setGameResult(nextResult);
    }
  }, [isPlaying, playerPos, playGrid, score, gameResult]);

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return;
      if (['ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault(); movePlayer(-1, 0);
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault(); movePlayer(1, 0);
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        e.preventDefault(); movePlayer(0, -1);
      } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault(); movePlayer(0, 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, movePlayer]);

  const activeGrid = isPlaying ? playGrid : grid;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full items-start">
      {/* Sidebar controls */}
      <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase mb-2">Editor-Modus</h2>
          <p className="text-xs text-zinc-500">Designen und testen Sie ein Mini-WebGL-Level direkt im Workspace.</p>
        </div>

        {/* Toolbar */}
        {!isPlaying ? (
          <div className="space-y-2">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Malschablone wählen</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TILE_CONFIG) as TileType[]).map((type) => {
                if (type === 'empty') return null;
                const active = selectedTool === type;
                const cfg = TILE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedTool(type)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      active
                        ? 'bg-amber-400/10 border-amber-400/30 text-white'
                        : 'bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 inline-block shrink-0 ${cfg.color} border border-white/10`} />
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="pt-4 flex gap-2">
              <button
                onClick={clearGrid}
                className="flex-1 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Grid leeren
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Punkte:</span>
                <span className="text-yellow-400 font-bold">{score}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Schritte:</span>
                <span className="text-white">{moves}</span>
              </div>
            </div>

            {/* Mobile / Screen navigation helper */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Tastensteuerung</span>
              <div className="grid grid-cols-3 gap-1.5 w-32 mx-auto">
                <div />
                <button onClick={() => movePlayer(-1, 0)} className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-zinc-300 font-bold font-mono">▲</button>
                <div />
                <button onClick={() => movePlayer(0, -1)} className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-zinc-300 font-bold font-mono">◀</button>
                <button onClick={() => movePlayer(1, 0)} className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-zinc-300 font-bold font-mono">▼</button>
                <button onClick={() => movePlayer(0, 1)} className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-zinc-300 font-bold font-mono">▶</button>
              </div>
              <p className="text-[10px] text-zinc-600 text-center mt-2">Auch WASD / Pfeiltasten spielbar.</p>
            </div>
          </div>
        )}

        {/* Big Start button */}
        <button
          onClick={isPlaying ? stopPlayTest : startPlayTest}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs cursor-pointer shadow-lg transition-all ${
            isPlaying
              ? 'bg-zinc-800 hover:bg-zinc-700 text-white shadow-black/35'
              : 'bg-amber-400 hover:bg-amber-500 text-black shadow-amber-500/10'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="w-4 h-4" /> Stop Playtest
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-black" /> Test Level starten
            </>
          )}
        </button>
      </div>

      {/* Level Designer / Play viewport */}
      <div className="xl:col-span-3 panel bg-black/30 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden min-h-[480px]">
        {/* Game overlay */}
        <AnimatePresence>
          {gameResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md z-20 flex flex-col items-center justify-center text-center p-6"
            >
              {gameResult === 'won' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 rounded-full w-fit mx-auto">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">Level bestanden!</h3>
                  <p className="text-zinc-400 text-sm max-w-xs">
                    Sie haben das Ziel erreicht und dabei <span className="text-yellow-400 font-bold">{score} Punkte</span> in {moves} Zügen gesammelt.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-red-500/10 border border-red-400/20 text-red-400 rounded-full w-fit mx-auto">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">GAME OVER</h3>
                  <p className="text-zinc-400 text-sm max-w-xs">Sie haben die glühende Lava berührt. Passen Sie das Level-Layout an, um das Ziel zu erreichen.</p>
                </div>
              )}
              
              <div className="flex gap-3 mt-8">
                <button
                  onClick={startPlayTest}
                  className="px-5 py-2.5 bg-amber-400 text-black text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-500 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Nochmal versuchen
                </button>
                <button
                  onClick={stopPlayTest}
                  className="px-5 py-2.5 bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-zinc-700 transition-colors"
                >
                  Editor öffnen
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Level Grid */}
        <div className="grid grid-rows-9 gap-1.5 w-full max-w-[700px] aspect-[12/9] bg-black/40 border border-white/5 p-3 rounded-2xl relative shadow-2xl">
          {activeGrid.map((row, r) => (
            <div key={r} className="grid grid-cols-12 gap-1.5 h-full">
              {row.map((cell, c) => {
                const cfg = TILE_CONFIG[cell];
                const isHoverable = !isPlaying;
                return (
                  <button
                    key={`${r}-${c}`}
                    disabled={isPlaying}
                    onClick={() => handleCellClick(r, c)}
                    className={`h-full aspect-square relative rounded-lg border transition-all duration-200 ${
                      cfg.border
                    } ${cfg.color} ${
                      isHoverable
                        ? 'hover:bg-white/[0.04] hover:scale-105 active:scale-95 cursor-crosshair'
                        : ''
                    }`}
                  >
                    {/* Visual markers when editing */}
                    {!isPlaying && cell === 'empty' && (
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-40 text-[9px] font-mono text-zinc-500">
                        {r},{c}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        
        <div className="mt-4 flex items-center gap-6 text-zinc-500 text-xs font-mono">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white/10" /> Start-Position</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-purple-600 rounded-md border border-white/10" /> Goal (Ziel)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-gradient-to-r from-red-600 to-orange-600 rounded border border-white/10" /> Lava (Hindernis)</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. Visual Scripting Sub-component
// ==========================================
type NodeType = 'start' | 'move' | 'sound' | 'score' | 'win' | 'log';

interface ScriptNode {
  id: string;
  type: NodeType;
  title: string;
  x: number;
  y: number;
  params: Record<string, string>;
  inputConnected?: string; // Node ID
  outputConnected?: string; // Node ID
}

function StudioVisualScripting() {
  const [nodes, setNodes] = useState<ScriptNode[]>([
    { id: '1', type: 'start', title: 'On Start', x: 50, y: 150, params: {} },
    { id: '2', type: 'move', title: 'Character Move', x: 260, y: 120, params: { direction: 'forward', speed: '5' } },
    { id: '3', type: 'sound', title: 'Play Sound Effect', x: 480, y: 220, params: { sfx: 'coin_collect' } }
  ]);

  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const NODE_STYLES: Record<NodeType, { bg: string; border: string; headerBg: string; text: string }> = {
    start: { bg: 'bg-[#1b2518]/90', border: 'border-emerald-500/30', headerBg: 'bg-emerald-500/25 text-emerald-400', text: 'text-emerald-300' },
    move: { bg: 'bg-[#1a2333]/90', border: 'border-blue-500/30', headerBg: 'bg-blue-500/25 text-blue-400', text: 'text-blue-300' },
    sound: { bg: 'bg-[#291e33]/90', border: 'border-purple-500/30', headerBg: 'bg-purple-500/25 text-purple-400', text: 'text-purple-300' },
    score: { bg: 'bg-[#2b2716]/90', border: 'border-yellow-500/30', headerBg: 'bg-yellow-500/25 text-yellow-400', text: 'text-yellow-300' },
    win: { bg: 'bg-[#2b1720]/90', border: 'border-pink-500/30', headerBg: 'bg-pink-500/25 text-pink-400', text: 'text-pink-300' },
    log: { bg: 'bg-[#1c2224]/90', border: 'border-zinc-500/30', headerBg: 'bg-zinc-500/25 text-zinc-400', text: 'text-zinc-300' }
  };

  // Node adding helper
  const addNode = (type: NodeType) => {
    const defaultParams: Record<NodeType, Record<string, string>> = {
      start: {},
      move: { direction: 'forward', speed: '5' },
      sound: { sfx: 'coin_collect' },
      score: { amount: '100' },
      win: {},
      log: { msg: 'Test triggered' }
    };

    const count = nodes.filter(n => n.type === type).length;
    const titles: Record<NodeType, string> = {
      start: 'On Event Trigger',
      move: 'Apply Impulse',
      sound: 'Play Audio',
      score: 'Modify Score',
      win: 'Complete Level',
      log: 'Output Log'
    };

    const newNode: ScriptNode = {
      id: String(Date.now()),
      type,
      title: `${titles[type]} ${count > 0 ? count + 1 : ''}`,
      x: 150 + Math.random() * 80,
      y: 100 + Math.random() * 80,
      params: defaultParams[type]
    };
    // Connect to output of last node if no output exists yet
    setNodes(prev => {
      const nextList = [...prev, newNode];
      if (prev.length > 0) {
        const lastNode = nextList[nextList.length - 2];
        if (!lastNode.outputConnected) {
          lastNode.outputConnected = newNode.id;
          newNode.inputConnected = lastNode.id;
        }
      }
      return nextList;
    });
    playSynthSound('coin');
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id).map(n => {
      const copy = { ...n };
      if (copy.inputConnected === id) delete copy.inputConnected;
      if (copy.outputConnected === id) delete copy.outputConnected;
      return copy;
    }));
    if (activeNode === id) setActiveNode(null);
    playSynthSound('lava');
  };

  // Mouse drag handling
  const startDrag = (id: string, e: React.MouseEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    setDraggedNode(id);
    setActiveNode(id);
    const n = nodes.find(item => item.id === id);
    if (n) {
      dragOffset.current = {
        x: e.clientX - n.x,
        y: e.clientY - n.y
      };
    }
  };

  const onDrag = (e: React.MouseEvent) => {
    if (!draggedNode) return;
    const nextNodes = nodes.map(n => {
      if (n.id === draggedNode) {
        // limit bounds inside canvas area
        let nx = e.clientX - dragOffset.current.x;
        let ny = e.clientY - dragOffset.current.y;
        if (nx < 0) nx = 0;
        if (ny < 0) ny = 0;
        return { ...n, x: nx, y: ny };
      }
      return n;
    });
    setNodes(nextNodes);
  };

  const endDrag = () => {
    setDraggedNode(null);
  };

  // SVG wires connectors calculation
  const renderConnections = () => {
    return (
      <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
        {nodes.map(n => {
          if (!n.outputConnected) return null;
          const target = nodes.find(item => item.id === n.outputConnected);
          if (!target) return null;

          // Compute wire ports (Output right of node n, Input left of target)
          const startX = n.x + 180;
          const startY = n.y + 40;
          const endX = target.x;
          const endY = target.y + 40;

          // Draw bezier curve for sleek visual scripting connector wire
          const cp1x = startX + 50;
          const cp2x = endX - 50;

          return (
            <g key={`wire-${n.id}-${target.id}`}>
              <path
                d={`M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="rgba(245, 158, 11, 0.4)"
                strokeWidth="2.5"
                strokeDasharray="4 2"
                className="animate-[dash_20s_linear_infinite]"
              />
              <circle cx={startX} cy={startY} r="4" className="fill-amber-400" />
              <circle cx={endX} cy={endY} r="4" className="fill-amber-400" />
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full items-start">
      {/* Node Catalog Selector */}
      <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase mb-2">Node Toolbox</h2>
          <p className="text-xs text-zinc-500">Fügen Sie Skript-Nodes hinzu und strukturieren Sie Spiellogik prozedural.</p>
        </div>

        <div className="space-y-2">
          {[
            { type: 'start', label: 'Ereignis Trigger', icon: Play },
            { type: 'move', label: 'Kraftimpuls (Physik)', icon: MoveIcon },
            { type: 'sound', label: 'Soundeffekt abspielen', icon: Volume2 },
            { type: 'score', label: 'Punkte modifizieren', icon: Sparkles },
            { type: 'win', label: 'Level Win Trigger', icon: Check },
            { type: 'log', label: 'Debug Konsolen-Log', icon: FileCode }
          ].map((item) => (
            <button
              key={item.type}
              onClick={() => addNode(item.type as any)}
              className="w-full flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <item.icon className="w-4 h-4 text-amber-400" />
                <span>{item.label}</span>
              </div>
              <PlusCircle className="w-4 h-4 text-zinc-600 hover:text-amber-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Node Graph Canvas */}
      <div className="xl:col-span-3 panel bg-[#0b080a] border border-white/[0.05] p-0 rounded-2xl h-[500px] relative overflow-hidden flex flex-col">
        {/* Graph Header Grid pattern */}
        <div className="px-4 py-3 bg-black/40 border-b border-white/[0.04] flex items-center justify-between z-10 shrink-0">
          <span className="text-xs text-zinc-400 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Visual Scripting Flowchart
          </span>
          <span className="text-[10px] text-zinc-600 font-mono">Rechtsklick/Linksklick Nodes zum Bearbeiten</span>
        </div>

        {/* Node board */}
        <div
          ref={canvasRef}
          onMouseMove={onDrag}
          onMouseUp={endDrag}
          className="flex-1 w-full relative overflow-hidden bg-[radial-gradient(rgba(255,255,255,0.02)_1.5px,transparent_1.5px)] bg-[size:24px_24px] cursor-grab active:cursor-grabbing"
        >
          {renderConnections()}

          {nodes.map((node) => {
            const styles = NODE_STYLES[node.type] || NODE_STYLES.log;
            const active = activeNode === node.id;
            return (
              <div
                key={node.id}
                onMouseDown={(e) => startDrag(node.id, e)}
                style={{ left: node.x, top: node.y }}
                className={`absolute w-44 rounded-xl border ${styles.bg} ${
                  active ? 'border-amber-400 shadow-lg shadow-amber-400/10' : styles.border
                } overflow-hidden shadow-2xl z-10 transition-shadow select-none`}
              >
                {/* Node Titlebar */}
                <div className={`px-3 py-1.5 text-xs font-semibold flex items-center justify-between ${styles.headerBg}`}>
                  <span className="truncate">{node.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Node Parameters */}
                <div className="p-3 space-y-2 text-[10px] text-zinc-400">
                  {node.type === 'move' && (
                    <>
                      <div className="flex flex-col gap-1">
                        <span>Richtung</span>
                        <select
                          value={node.params.direction}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, params: { ...n.params, direction: val } } : n));
                          }}
                          className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white outline-none"
                        >
                          <option value="forward">Vorwärts</option>
                          <option value="backward">Rückwärts</option>
                          <option value="up">Hoch</option>
                          <option value="down">Runter</option>
                        </select>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span>Speed</span>
                        <input
                          type="number"
                          value={node.params.speed}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, params: { ...n.params, speed: val } } : n));
                          }}
                          className="w-12 bg-black/40 border border-white/10 rounded text-center text-white"
                        />
                      </div>
                    </>
                  )}
                  {node.type === 'sound' && (
                    <div className="flex flex-col gap-1">
                      <span>Soundeffekt</span>
                      <select
                        value={node.params.sfx}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, params: { ...n.params, sfx: val } } : n));
                        }}
                        className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white outline-none"
                      >
                        <option value="coin_collect">Münze einsammeln</option>
                        <option value="lava_fail">Lava-Tod</option>
                        <option value="level_win">Sieg Akkord</option>
                      </select>
                    </div>
                  )}
                  {node.type === 'score' && (
                    <div className="flex justify-between items-center gap-2">
                      <span>Menge (+/-)</span>
                      <input
                        type="text"
                        value={node.params.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, params: { ...n.params, amount: val } } : n));
                        }}
                        className="w-16 bg-black/40 border border-white/10 rounded text-center text-white"
                      />
                    </div>
                  )}
                  {node.type === 'log' && (
                    <div className="flex flex-col gap-1">
                      <span>Nachricht</span>
                      <input
                        type="text"
                        value={node.params.msg}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, params: { ...n.params, msg: val } } : n));
                        }}
                        className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-white"
                      />
                    </div>
                  )}
                  {node.type === 'start' && <span className="text-zinc-500 font-mono text-[9px]">Gibt Startimpuls</span>}
                  {node.type === 'win' && <span className="text-zinc-500 font-mono text-[9px]">Beendet Spielinstanz</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  );
}

// ==========================================
// 4. 3D Asset Forge Sub-component
// ==========================================
function Studio3DForge() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Custom mesh parameter sliders
  const [shape, setShape] = useState<'cube' | 'pyramid' | 'torus' | 'star'>('torus');
  const [colorPalette, setColorPalette] = useState<'cyan' | 'pink' | 'emerald' | 'gold'>('cyan');
  const [scale, setScale] = useState(1.8);
  const [speedX, setSpeedX] = useState(0.8);
  const [speedY, setSpeedY] = useState(0.5);
  const [wireframe, setWireframe] = useState(false);
  const [distortion, setDistortion] = useState(0.0); // Sine wave displacement

  const rotation = useRef({ x: 0, y: 0 });

  // Procedural generator
  const mesh = useMemo(() => {
    if (shape === 'cube') return generateCube();
    if (shape === 'pyramid') return generatePyramid();
    if (shape === 'star') return generateStar();
    return generateTorus(1.0, 0.45, 12, 12);
  }, [shape]);

  // Color mapper
  const colors = useMemo(() => {
    if (colorPalette === 'pink') return { primary: '#ec4899', secondary: '#f43f5e', fill: 'rgba(236, 72, 153, 0.15)', stroke: 'rgba(236, 72, 153, 0.65)' };
    if (colorPalette === 'emerald') return { primary: '#10b981', secondary: '#059669', fill: 'rgba(16, 185, 129, 0.15)', stroke: 'rgba(16, 185, 129, 0.65)' };
    if (colorPalette === 'gold') return { primary: '#f59e0b', secondary: '#d97706', fill: 'rgba(245, 158, 11, 0.15)', stroke: 'rgba(245, 158, 11, 0.65)' };
    return { primary: '#06b6d4', secondary: '#0891b2', fill: 'rgba(6, 182, 212, 0.15)', stroke: 'rgba(6, 182, 212, 0.65)' };
  }, [colorPalette]);

  // Render loop
  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.03;

      // Adjust rotation angles
      rotation.current.x += 0.01 * speedX;
      rotation.current.y += 0.015 * speedY;

      const angleX = rotation.current.x;
      const angleY = rotation.current.y;

      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Map 3D vertices to rotated 2D space
      const projected: { x: number; y: number; z: number }[] = mesh.vertices.map((v) => {
        let x = v[0];
        let y = v[1];
        let z = v[2];

        // Apply distortion if any
        if (distortion > 0) {
          const r = Math.sqrt(x*x + y*y + z*z);
          const wave = Math.sin(r * 4 + time * 3) * distortion * 0.18;
          x += (x / r) * wave;
          y += (y / r) * wave;
          z += (z / r) * wave;
        }

        // Apply scaling
        x *= scale * 75;
        y *= scale * 75;
        z *= scale * 75;

        // Rotation X
        const y1 = y * cosX - z * sinX;
        const z1 = y * sinX + z * cosX;

        // Rotation Y
        const x2 = x * cosY + z1 * sinY;
        const z2 = -x * sinY + z1 * cosY;

        // Simple perspective projection
        const distance = 400;
        const fov = 350;
        const scaleFactor = fov / (distance + z2);
        
        return {
          x: cx + x2 * scaleFactor,
          y: cy + y1 * scaleFactor,
          z: z2
        };
      });

      // Simple Face sorting by average depth (Z-buffer style)
      const facesWithDepth = mesh.faces.map((face, index) => {
        const avgZ = face.reduce((sum, idx) => sum + projected[idx].z, 0) / face.length;
        return { face, avgZ, index };
      });
      facesWithDepth.sort((a, b) => b.avgZ - a.avgZ);

      // Render faces
      facesWithDepth.forEach(({ face }) => {
        if (face.length >= 3) {
          const p0 = projected[face[0]];
          const p1 = projected[face[1]];
          const p2 = projected[face[2]];
          const area = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
          if (area < 0) return;
        }

        ctx.beginPath();
        face.forEach((vertexIdx, i) => {
          const pt = projected[vertexIdx];
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();

        // Solid fills
        if (!wireframe) {
          ctx.fillStyle = colors.fill;
          ctx.fill();
        }

        // Wireframe strokes
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = wireframe ? 1.5 : 0.8;
        ctx.stroke();
      });

      // Render vertices as points if wireframe is active
      if (wireframe) {
        projected.forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
          ctx.fillStyle = colors.primary;
          ctx.fill();
        });
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [mesh, colors, scale, speedX, speedY, wireframe, distortion]);

  const exportMesh = () => {
    const data = JSON.stringify({
      shape,
      scale,
      vertices: mesh.vertices,
      faces: mesh.faces
    }, null, 2);
    
    navigator.clipboard.writeText(data).then(() => {
      window.alert('3D Mesh Geometrie-Daten in Zwischenablage kopiert! (JSON Format)');
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full items-start">
      {/* Parameters Panel */}
      <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase mb-2">3D Modifikator</h2>
          <p className="text-xs text-zinc-500">Konstruieren Sie Geometrien live im in-app Canvas.</p>
        </div>

        <div className="space-y-4">
          {/* Shape Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Primitive Form</label>
            <select
              value={shape}
              onChange={(e) => setShape(e.target.value as any)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
            >
              <option value="torus">Torus (Donut)</option>
              <option value="cube">Würfel (Cube)</option>
              <option value="pyramid">Pyramide (Pyramid)</option>
              <option value="star">3D Stern (Star)</option>
            </select>
          </div>

          {/* Color palette */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Neon-Material</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'cyan', color: 'bg-cyan-400' },
                { id: 'pink', color: 'bg-pink-500' },
                { id: 'emerald', color: 'bg-emerald-500' },
                { id: 'gold', color: 'bg-amber-500' }
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColorPalette(c.id as any)}
                  className={`h-8 rounded-lg cursor-pointer border ${
                    colorPalette === c.id ? 'border-white ring-2 ring-amber-400/20' : 'border-white/10'
                  } ${c.color}`}
                />
              ))}
            </div>
          </div>

          <hr className="border-white/5" />

          {/* Scaling */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Größenfaktor</span>
              <span>{scale.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Speed X */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Rotation X Speed</span>
              <span>{speedX.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="2.5"
              step="0.1"
              value={speedX}
              onChange={(e) => setSpeedX(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Speed Y */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Rotation Y Speed</span>
              <span>{speedY.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="2.5"
              step="0.1"
              value={speedY}
              onChange={(e) => setSpeedY(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Wave distortion */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Frequenz-Verformung</span>
              <span>{distortion.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={distortion}
              onChange={(e) => setDistortion(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          <hr className="border-white/5" />

          {/* Wireframe toggle */}
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <span>Wireframe-Gittermodus</span>
            <button
              onClick={() => setWireframe(!wireframe)}
              className={`w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors duration-200 ${
                wireframe ? 'bg-amber-400' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-black shadow-md transform duration-200 ${
                  wireframe ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <button
          onClick={exportMesh}
          className="w-full py-3 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors mt-6"
        >
          <Database className="w-3.5 h-3.5" /> JSON Mesh kopieren
        </button>
      </div>

      {/* Canvas view */}
      <div className="xl:col-span-3 panel bg-black/45 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden min-h-[460px]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
        
        <canvas
          ref={canvasRef}
          width={650}
          height={400}
          className="relative max-w-full z-10 w-[650px] aspect-[13/8]"
        />

        <div className="absolute bottom-4 left-4 z-10 text-[10px] text-zinc-500 font-mono space-y-0.5">
          <div>Vertices: {mesh.vertices.length}</div>
          <div>Faces: {mesh.faces.length}</div>
          <div>Shading: Wireframe Outline / Flat Ambient Fill</div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. Shader Lab Sub-component
// ==========================================
function StudioShaderLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Custom slider controllers
  const [speed, setSpeed] = useState(1.0);
  const [resolution, setResolution] = useState(3.0);
  const [neonFactor, setNeonFactor] = useState(0.85);
  const [shaderType, setShaderType] = useState<'plasma' | 'vortex' | 'matrix'>('plasma');

  // Animation draw
  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.02 * speed;
      const w = canvas.width;
      const h = canvas.height;
      
      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;

      // Select dynamic logic
      if (shaderType === 'plasma') {
        const step = 4 - resolution + 1;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const nx = x / w - 0.5;
            const ny = y / h - 0.5;

            let v = 0;
            v += Math.sin(nx * 10 + time);
            v += Math.sin(10 * (nx * Math.sin(time / 2) + ny * Math.cos(time / 3)) + time);
            const cx = nx + 0.5 * Math.sin(time / 5);
            const cy = ny + 0.5 * Math.cos(time / 3);
            v += Math.sin(Math.sqrt(100 * (cx * cx + cy * cy) + 1) + time);
            v /= 3.0;

            const r = Math.sin(v * Math.PI) * 0.5 + 0.5;
            const g = Math.sin(v * Math.PI + (2 * Math.PI) / 3) * 0.5 + 0.5;
            const b = Math.sin(v * Math.PI + (4 * Math.PI) / 3) * 0.5 + 0.5;

            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const idx = ((y + dy) * w + (x + dx)) * 4;
                data[idx] = Math.round(r * 255 * neonFactor);
                data[idx + 1] = Math.round(g * 255 * neonFactor);
                data[idx + 2] = Math.round(b * 255);
                data[idx + 3] = 255;
              }
            }
          }
        }
      } else if (shaderType === 'vortex') {
        const step = 4 - resolution + 1;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const nx = (x - w/2) / (w/2);
            const ny = (y - h/2) / (h/2);

            const rCoord = Math.sqrt(nx*nx + ny*ny);
            const phi = Math.atan2(ny, nx) + rCoord * 4.0 - time * 2;

            const val = Math.sin(phi * 3.0) * 0.5 + 0.5;

            const rVal = Math.round(val * 150 * neonFactor);
            const gVal = Math.round(val * 50);
            const bVal = Math.round(val * 255);

            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const idx = ((y + dy) * w + (x + dx)) * 4;
                data[idx] = rVal;
                data[idx + 1] = gVal;
                data[idx + 2] = bVal;
                data[idx + 3] = 255;
              }
            }
          }
        }
      } else {
        const step = 4 - resolution + 1;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const nx = x / w;
            const ny = y / h;

            const val = Math.sin(nx * 20) * Math.cos(ny * 20 - time * 5) * Math.sin(time);
            const rVal = 0;
            const gVal = Math.max(0, Math.round((val * 0.5 + 0.5) * 255 * neonFactor));
            const bVal = Math.max(0, Math.round((val * 0.5 + 0.5) * 50));

            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const idx = ((y + dy) * w + (x + dx)) * 4;
                data[idx] = rVal;
                data[idx + 1] = gVal;
                data[idx + 2] = bVal;
                data[idx + 3] = 255;
              }
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [speed, resolution, neonFactor, shaderType]);

  const glslCode = useMemo(() => {
    if (shaderType === 'plasma') {
      return `// PLASMA FRAGMENT SHADER
uniform float time;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
    vec2 p = -1.0 + 2.0 * vUv;
    float v = 0.0;
    v += sin(p.x * 10.0 + time);
    v += sin(10.0 * (p.x * sin(time/2.0) + p.y * cos(time/3.0)) + time);
    float cx = p.x + 0.5 * sin(time/5.0);
    float cy = p.y + 0.5 * cos(time/3.0);
    v += sin(sqrt(100.0 * (cx*cx + cy*cy) + 1.0) + time);
    v /= 3.0;
    
    vec3 col = vec3(sin(v * 3.1415), sin(v * 3.1415 + 2.0), sin(v * 3.1415 + 4.0)) * 0.5 + 0.5;
    gl_FragColor = vec4(col * ${neonFactor.toFixed(2)}, 1.0);
}`;
    }
    if (shaderType === 'vortex') {
      return `// VORTEX SPLINE SHADER
uniform float time;
varying vec2 vUv;

void main() {
    vec2 uv = vUv - vec2(0.5);
    float r = length(uv);
    float angle = atan(uv.y, uv.x) + r * 4.0 - time * 2.0;
    float intensity = sin(angle * 3.0) * 0.5 + 0.5;
    
    vec3 color = vec3(intensity * ${neonFactor.toFixed(2)}, intensity * 0.2, intensity);
    gl_FragColor = vec4(color, 1.0);
}`;
    }
    return `// MATRIX FALLING NOISE SHADER
uniform float time;
varying vec2 vUv;

void main() {
    float cell = sin(vUv.x * 20.0) * cos(vUv.y * 20.0 - time * 5.0) * sin(time);
    vec3 color = vec3(0.0, max(0.0, cell) * ${neonFactor.toFixed(2)}, 0.1);
    gl_FragColor = vec4(color, 1.0);
}`;
  }, [shaderType, neonFactor]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full items-start">
      {/* Configuration Sliders */}
      <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase mb-2">Shader-Parameter</h2>
          <p className="text-xs text-zinc-500">Mathematische Pixelberechnung in Echtzeit.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Algorithmus</label>
            <select
              value={shaderType}
              onChange={(e) => setShaderType(e.target.value as any)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
            >
              <option value="plasma">Vibrant Cosine Plasma</option>
              <option value="vortex">Hypnotic Vortex Spiral</option>
              <option value="matrix">Matrix Rainfall Simulation</option>
            </select>
          </div>

          <hr className="border-white/5" />

          {/* Speed */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Geschwindigkeit</span>
              <span>{speed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Resolution */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Pixel-Dichte</span>
              <span>{resolution === 3 ? 'Ultra' : resolution === 2 ? 'Medium' : 'Low-fi'}</span>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="1"
              value={resolution}
              onChange={(e) => setResolution(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Neon factor */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>Neon Intensität</span>
              <span>{Math.round(neonFactor * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.2"
              step="0.05"
              value={neonFactor}
              onChange={(e) => setNeonFactor(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>
        </div>

        <button
          onClick={() => {
            navigator.clipboard.writeText(glslCode);
            window.alert('GLSL Shader-Code in Zwischenablage kopiert!');
          }}
          className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors mt-6 border border-white/5"
        >
          <FileCode className="w-3.5 h-3.5" /> GLSL kopieren
        </button>
      </div>

      {/* Render Canvas and code */}
      <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
        {/* Render Target */}
        <div className="panel bg-black/45 border border-white/[0.04] p-5 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden min-h-[350px]">
          <canvas
            ref={canvasRef}
            width={240}
            height={240}
            className="rounded-xl border border-white/10 shadow-2xl scale-110 w-[240px] h-[240px]"
          />
          <span className="text-[10px] text-zinc-500 font-mono mt-8">Render-Ausgabe: HTML5 Pixels Buffer (GLSL emulated)</span>
        </div>

        {/* Code display */}
        <div className="panel bg-black/60 border border-white/[0.05] p-5 rounded-2xl flex flex-col h-full font-mono text-[11px] text-emerald-400/90 overflow-hidden relative">
          <div className="flex items-center justify-between text-zinc-500 border-b border-white/5 pb-2 mb-3">
            <span>fragment_shader.glsl</span>
            <span className="text-[9px] uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">GLSL ES</span>
          </div>
          <pre className="flex-1 overflow-auto custom-scrollbar select-all whitespace-pre-wrap leading-relaxed">
            {glslCode}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. Kanban Board Sub-component
// ==========================================
interface KanbanCard {
  id: string;
  title: string;
  desc: string;
  priority: 'low' | 'medium' | 'high';
  tag: string;
}

function StudioKanbanBoard() {
  const [board, setBoard] = useState<Record<string, KanbanCard[]>>({
    backlog: [
      { id: 't1', title: 'Audio-Effekt Münze', desc: 'Verfeinere Web Audio Synthesizer Tonhöhen-Anstiege', priority: 'low', tag: 'Sound' },
      { id: 't2', title: 'Player Physik einbauen', desc: 'Binde Masseträgheit in Sprite-Bewegung ein', priority: 'high', tag: 'Engine' }
    ],
    todo: [
      { id: 't3', title: 'Shader Optimierung', desc: 'Fragment Shader Pixel-Loops minimieren', priority: 'medium', tag: 'Shader' },
      { id: 't4', title: 'WebGL Release testen', desc: 'Prüfe mobile Browser FPS Ladezeiten', priority: 'high', tag: 'Build' }
    ],
    progress: [
      { id: 't5', title: '3D Forge Algorithmus', desc: 'Entwickle 3D Torus Rendering auf Canvas', priority: 'medium', tag: '3D Graphics' }
    ],
    done: [
      { id: 't6', title: 'Studio Tab Layout', desc: 'Entwerfe Responsive Studio CSS System', priority: 'medium', tag: 'UI Design' }
    ]
  });

  const [newCard, setNewCard] = useState({ title: '', desc: '', tag: 'Feature', column: 'backlog' });
  const [showAddForm, setShowAddForm] = useState(false);

  const moveCard = (cardId: string, fromCol: string, toCol: string) => {
    const card = board[fromCol].find(c => c.id === cardId);
    if (!card) return;

    setBoard(prev => ({
      ...prev,
      [fromCol]: prev[fromCol].filter(c => c.id !== cardId),
      [toCol]: [...prev[toCol], card]
    }));
    playSynthSound('coin');
  };

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCard.title.trim()) return;

    const card: KanbanCard = {
      id: String(Date.now()),
      title: newCard.title,
      desc: newCard.desc,
      priority: 'medium',
      tag: newCard.tag
    };

    setBoard(prev => ({
      ...prev,
      [newCard.column]: [...prev[newCard.column], card]
    }));

    setNewCard({ title: '', desc: '', tag: 'Feature', column: 'backlog' });
    setShowAddForm(false);
    playSynthSound('coin');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-black/10 border border-white/[0.04] p-4 rounded-xl">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase">Kanban-Board</h2>
          <p className="text-xs text-zinc-500">Planen und organisieren Sie Ihre Meilensteine und Assets direkt.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Task hinzufügen
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleCreateCard} className="panel bg-black/25 border border-white/[0.05] p-5 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Titel</label>
                <input
                  type="text"
                  placeholder="Task Name..."
                  value={newCard.title}
                  onChange={e => setNewCard(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Beschreibung</label>
                <input
                  type="text"
                  placeholder="Details..."
                  value={newCard.desc}
                  onChange={e => setNewCard(prev => ({ ...prev, desc: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Tag</label>
                  <select
                    value={newCard.tag}
                    onChange={e => setNewCard(prev => ({ ...prev, tag: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-white/20"
                  >
                    <option value="Feature">Feature</option>
                    <option value="Asset">Asset</option>
                    <option value="Bug">Bug</option>
                    <option value="Sound">Sound</option>
                    <option value="Build">Build</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Spalte</label>
                  <select
                    value={newCard.column}
                    onChange={e => setNewCard(prev => ({ ...prev, column: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-white/20"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="progress">In Progress</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="w-full py-2 bg-amber-400 text-black text-xs font-bold rounded-xl hover:bg-amber-500 cursor-pointer">
                  Speichern
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="w-full py-2 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-zinc-700 cursor-pointer">
                  Abbrechen
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid columns */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
        {[
          { id: 'backlog', title: 'Backlog', color: 'border-t-zinc-600 bg-zinc-950/20' },
          { id: 'todo', title: 'To Do', color: 'border-t-yellow-500 bg-yellow-500/[0.01]' },
          { id: 'progress', title: 'In Progress', color: 'border-t-blue-500 bg-blue-500/[0.01]' },
          { id: 'done', title: 'Done', color: 'border-t-emerald-500 bg-emerald-500/[0.01]' }
        ].map((col) => (
          <div key={col.id} className={`panel border-t-2 ${col.color} border border-white/[0.04] p-4 rounded-2xl flex flex-col min-h-[350px]`}>
            <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-4 text-xs font-bold text-white uppercase tracking-wider">
              <span>{col.title}</span>
              <span className="font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">{board[col.id].length}</span>
            </div>

            <div className="flex-1 space-y-3.5 overflow-y-auto max-h-[380px] custom-scrollbar pb-2">
              {board[col.id].map((card) => (
                <div key={card.id} className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl hover:border-white/10 hover:shadow-lg transition-all relative group">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-zinc-500 font-mono text-[9px] uppercase px-1.5 py-0.5 bg-white/5 rounded border border-white/5">
                      {card.tag}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {col.id !== 'backlog' && (
                        <button
                          onClick={() => {
                            const map: Record<string, string> = { todo: 'backlog', progress: 'todo', done: 'progress' };
                            moveCard(card.id, col.id, map[col.id]);
                          }}
                          title="Left"
                          className="p-1 hover:text-white text-[10px] text-zinc-500"
                        >
                          ◀
                        </button>
                      )}
                      {col.id !== 'done' && (
                        <button
                          onClick={() => {
                            const map: Record<string, string> = { backlog: 'todo', todo: 'progress', progress: 'done' };
                            moveCard(card.id, col.id, map[col.id]);
                          }}
                          title="Right"
                          className="p-1 hover:text-white text-[10px] text-zinc-500"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-200 mt-2">{card.title}</h4>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{card.desc}</p>
                </div>
              ))}
              {board[col.id].length === 0 && (
                <div className="h-24 flex items-center justify-center border border-dashed border-white/5 rounded-xl text-zinc-700 text-xs">
                  Spalte leer
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 7. Compiler & Build Sub-component
// ==========================================
function StudioBuildCenter() {
  const [platform, setPlatform] = useState<'webgl' | 'win' | 'android'>('webgl');
  const [optLevel, setOptLevel] = useState<'O3' | 'Oz' | 'none'>('O3');
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Engine-Kopplung initialisiert.',
    '[SYSTEM] Warte auf Compiler-Kommando...'
  ]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);

  const startBuild = () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setProgress(0);
    setLogs([
      `[COMPILER] Starten des Build-Prozesses auf Plattform: ${platform.toUpperCase()}`,
      `[COMPILER] Optimierungsstufe: -${optLevel}`,
      '[COMPILER] Analysiere Skript-Ressourcen...',
    ]);

    const buildSteps = [
      '[COMPILER] Lade CodeForge Asset-Datenbank...',
      '[COMPILER] Generiere GLSL Shader-Paket...',
      '[COMPILER] Transpiliere Node-basierte Skripte in JavaScript...',
      '[COMPILER] Minifiziere JS-Dateien und verpacke WebGL Assets...',
      '[COMPILER] Kompression der Texturen auf Brotli-Format...',
      '[COMPILER] Erstelle index.html und WebGL Loader...',
      '[PUBLISHER] Lade Archivdatei temporär hoch...',
      '[PUBLISHER] Build erfolgreich hochgeladen auf dev-env.codeforge.local!',
      '[SYSTEM] Fertig!'
    ];

    let step = 0;
    const interval = setInterval(() => {
      if (step < buildSteps.length) {
        setLogs(prev => [...prev, buildSteps[step]]);
        setProgress(Math.round(((step + 1) / buildSteps.length) * 100));
        step++;
      } else {
        clearInterval(interval);
        setIsBuilding(false);
        playSynthSound('build');
      }
    }, 900);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full items-start">
      {/* Configuration Panel */}
      <div className="panel bg-black/10 border border-white/[0.04] p-5 rounded-2xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wider uppercase mb-2">Build Target</h2>
          <p className="text-xs text-zinc-500">Kompilieren und Exportieren Sie die fertige Anwendung.</p>
        </div>

        <div className="space-y-4">
          {/* Target Platform */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Ziel-Plattform</label>
            <select
              value={platform}
              disabled={isBuilding}
              onChange={(e) => setPlatform(e.target.value as any)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
            >
              <option value="webgl">WebGL Browser (HTML/JS)</option>
              <option value="win">Windows Executable (.exe)</option>
              <option value="android">Android Installer (.apk)</option>
            </select>
          </div>

          {/* Optimizations */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Optimierungsstufe</label>
            <select
              value={optLevel}
              disabled={isBuilding}
              onChange={(e) => setOptLevel(e.target.value as any)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20"
            >
              <option value="O3">Optimiert (-O3 standard)</option>
              <option value="Oz">Größen-optimiert (-Oz Brotli)</option>
              <option value="none">Keine (Debug mode)</option>
            </select>
          </div>

          <hr className="border-white/5" />

          {/* Build Info */}
          <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5 text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>Paket-Name:</span>
              <span className="font-mono text-zinc-300">com.forge.neon</span>
            </div>
            <div className="flex justify-between">
              <span>WebGL WebAssembly:</span>
              <span className="font-mono text-zinc-300">Aktiviert</span>
            </div>
            <div className="flex justify-between">
              <span>Optimierte Shader:</span>
              <span className="font-mono text-zinc-300">Ja</span>
            </div>
          </div>
        </div>

        {/* Start compiler */}
        <button
          onClick={startBuild}
          disabled={isBuilding}
          className="w-full py-3 bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 hover:bg-amber-500 text-black text-xs font-bold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors mt-6 shadow-lg shadow-amber-500/10"
        >
          {isBuilding ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              Kompiliere...
            </>
          ) : (
            <>
              <Wrench className="w-3.5 h-3.5" /> Compiler starten
            </>
          )}
        </button>
      </div>

      {/* Compiler Terminal Screen */}
      <div className="xl:col-span-3 panel bg-[#050405] border border-white/[0.06] rounded-2xl h-[420px] flex flex-col overflow-hidden relative shadow-2xl">
        <div className="px-4 py-3 bg-[#0d090d] border-b border-white/[0.04] flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="ml-1">compiler_console.log</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">PAGER=cat</span>
        </div>

        {/* Console outputs */}
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar font-mono text-xs text-zinc-300 space-y-1.5 select-text min-h-0">
          {logs.map((log, index) => {
            let color = 'text-zinc-400';
            if (log.startsWith('[SYSTEM]')) color = 'text-amber-400';
            if (log.startsWith('[PUBLISHER]')) color = 'text-purple-400';
            if (log.includes('erfolgreich') || log.includes('Fertig!')) color = 'text-emerald-400';
            return (
              <div key={index} className={`leading-relaxed ${color}`}>
                {log}
              </div>
            );
          })}

          {isBuilding && (
            <div className="pt-4 space-y-2">
              <div className="w-full bg-white/[0.05] h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>WebGL Asset Bundle Komprimierung</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
