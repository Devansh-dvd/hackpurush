import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
    RotateCw,
    RotateCcw,
    Eye,
    Layers,
    Crosshair,
    Radio,
    ShieldAlert,
    Gauge,
} from "lucide-react";

interface RoverArmViewerProps {
    height?: number | string;
    /** Joint angles in degrees: [base, shoulder, elbow, wristPitch, wristRoll, gripper] */
    joints?: [number, number, number, number, number, number];
}

type ViewPreset = "PERSPECTIVE" | "TOP" | "FRONT" | "SIDE" | "REAR";
type DisplayMode = "TACTICAL" | "WIREFRAME" | "THERMAL";

export default function RoverArmViewer({
    height = "100%",
    joints: _joints = [90, 120, 100, 90, 90, 40],
}: RoverArmViewerProps) {
    const mountRef        = useRef<HTMLDivElement>(null);
    const rendererRef     = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef       = useRef<THREE.PerspectiveCamera | null>(null);
    const materialsRef    = useRef<THREE.MeshStandardMaterial[]>([]);

    // Animated nodes
    const baseGrpRef         = useRef<THREE.Group | null>(null);
    const shoulderGrpRef     = useRef<THREE.Group | null>(null);
    const elbowGrpRef        = useRef<THREE.Group | null>(null);
    const wristPitchGrpRef   = useRef<THREE.Group | null>(null);
    const gripperGrpRef      = useRef<THREE.Group | null>(null);
    const finger1Ref         = useRef<THREE.Mesh | null>(null);
    const finger2Ref         = useRef<THREE.Mesh | null>(null);
    const fingerThumbRef     = useRef<THREE.Mesh | null>(null);
    const fanBladesRef       = useRef<THREE.Group | null>(null);
    const lidarHeadRef       = useRef<THREE.Group | null>(null);
    const panCamRef          = useRef<THREE.Group | null>(null);
    const tiltCamRef         = useRef<THREE.Group | null>(null);

    const [autoRotate,  setAutoRotate]  = useState(true);
    const [displayMode, setDisplayMode] = useState<DisplayMode>("TACTICAL");
    const [viewPreset,  setViewPreset]  = useState<ViewPreset>("PERSPECTIVE");
    const [hudData, setHudData] = useState({ yaw: 42, dist: 9.0 });

    const isDraggingRef   = useRef(false);
    const dragModeRef     = useRef<"rotate" | "pan">("rotate");
    const prevPtrRef      = useRef({ x: 0, y: 0 });
    const sphericalRef    = useRef({ radius: 6.6, theta: Math.PI / 4, phi: Math.PI / 3 });
    const targetRef       = useRef(new THREE.Vector3(0, 0.4, 0));
    const autoRotateRef   = useRef(autoRotate);

    useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

    const applyViewPreset = useCallback((preset: ViewPreset) => {
        setViewPreset(preset);
        setAutoRotate(false);
        const r = 7.0;
        if (preset === "TOP")        sphericalRef.current = { radius: r, theta: 0, phi: 0.08 };
        else if (preset === "FRONT") sphericalRef.current = { radius: r, theta: 0, phi: Math.PI / 2 };
        else if (preset === "SIDE")  sphericalRef.current = { radius: r, theta: Math.PI / 2, phi: Math.PI / 2 };
        else if (preset === "REAR")  sphericalRef.current = { radius: r, theta: Math.PI, phi: Math.PI / 2 };
        else                         sphericalRef.current = { radius: 6.6, theta: Math.PI / 4, phi: Math.PI / 3 };
        targetRef.current.set(0, 0.4, 0);
    }, []);

    const resetView = () => { applyViewPreset("PERSPECTIVE"); setAutoRotate(true); };

    // Display mode synchronization
    useEffect(() => {
        materialsRef.current.forEach((mat) => {
            if (displayMode === "WIREFRAME") {
                mat.wireframe = true;
                mat.color.setHex(0x00f0ff);
                mat.emissive.setHex(0x003344);
            } else if (displayMode === "THERMAL") {
                mat.wireframe = false;
                mat.color.setHex(0xff6600);
                mat.emissive.setHex(0x552200);
            } else {
                mat.wireframe = false;
                if (mat.userData.origColor)    mat.color.copy(mat.userData.origColor);
                if (mat.userData.origEmissive) mat.emissive.copy(mat.userData.origEmissive);
            }
        });
    }, [displayMode]);

    // ── Three.js Scene Setup ─────────────────────────────────────────────────
    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        const W = container.clientWidth  || 600;
        const H = container.clientHeight || 400;

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x06080c, 0.045);

        const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        rendererRef.current = renderer;
        container.appendChild(renderer.domElement);

        // ── Lighting ──
        scene.add(new THREE.AmbientLight(0x99aacc, 0.85));

        const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
        keyLight.position.set(8, 15, 10);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.bias = -0.0008;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x5577bb, 1.2);
        fillLight.position.set(-8, 5, -6);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xc6ff3d, 0.6);
        rimLight.position.set(0, -4, -6);
        scene.add(rimLight);

        // Under-rover tactical glow
        const underGlow = new THREE.PointLight(0x1e40af, 1.8, 6.5);
        underGlow.position.set(0, -0.9, 0);
        scene.add(underGlow);

        // Front spotlights illumination
        const frontSpotLeft = new THREE.SpotLight(0xfffae0, 2.8, 9, Math.PI / 4, 0.35, 1.2);
        frontSpotLeft.position.set(-0.6, 0.2, -1.9);
        frontSpotLeft.target.position.set(-0.8, -0.8, -6);
        scene.add(frontSpotLeft);
        scene.add(frontSpotLeft.target);

        const frontSpotRight = new THREE.SpotLight(0xfffae0, 2.8, 9, Math.PI / 4, 0.35, 1.2);
        frontSpotRight.position.set(0.6, 0.2, -1.9);
        frontSpotRight.target.position.set(0.8, -0.8, -6);
        scene.add(frontSpotRight);
        scene.add(frontSpotRight.target);

        // ── Material Helpers ──
        const mats: THREE.MeshStandardMaterial[] = [];
        const mkMat = (params: THREE.MeshStandardMaterialParameters & { side?: THREE.Side }) => {
            const m = new THREE.MeshStandardMaterial(params);
            m.userData.origColor    = m.color.clone();
            m.userData.origEmissive = m.emissive.clone();
            mats.push(m);
            return m;
        };
        materialsRef.current = mats;

        // Specialized Hardware Materials
        const chassisMat    = mkMat({ color: 0xf4f6f8, roughness: 0.45, metalness: 0.10 }); // white acrylic deck
        const chassisWood   = mkMat({ color: 0x5a4231, roughness: 0.85, metalness: 0.05 }); // wooden standoffs
        const darkMat       = mkMat({ color: 0x181c24, roughness: 0.65, metalness: 0.30 }); // dark tactical structural plastic
        const tireMat       = mkMat({ color: 0x12141a, roughness: 0.95, metalness: 0.02 }); // deep rubber tyre
        const dishRimMat    = mkMat({ color: 0xeef2f7, roughness: 0.35, metalness: 0.25 }); // white dished wheel hub
        const pcbGreenMat   = mkMat({ color: 0x145a32, roughness: 0.70, metalness: 0.15, emissive: new THREE.Color(0x062810), emissiveIntensity: 0.3 }); // Raspberry Pi green PCB
        const pcbBlueMat    = mkMat({ color: 0x1d4ed8, roughness: 0.60, metalness: 0.20 }); // PCA9685 blue PCB
        const pcbRedMat     = mkMat({ color: 0xb91c1c, roughness: 0.65, metalness: 0.20 }); // L298N red motor driver PCB
        const brassMat      = mkMat({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 }); // brass heatsink / standoffs / SMA connector
        const silverMat     = mkMat({ color: 0xd1d5db, roughness: 0.25, metalness: 0.90 }); // silver USB ports, hex bolts, motor fins
        const armBlueMat    = mkMat({ color: 0x1d64e8, roughness: 0.35, metalness: 0.50, emissive: new THREE.Color(0x061e4e), emissiveIntensity: 0.4 }); // iconic arm blue
        const armWhiteMat   = mkMat({ color: 0xf1f5f9, roughness: 0.40, metalness: 0.25 }); // arm white link
        const servoBlackMat = mkMat({ color: 0x181a20, roughness: 0.60, metalness: 0.35 }); // MG996R servo casing
        const servoGreyMat  = mkMat({ color: 0x94a3b8, roughness: 0.45, metalness: 0.60 }); // servo horn / brackets
        const powerBankMat  = mkMat({ color: 0x5b3858, roughness: 0.35, metalness: 0.60 }); // metallic purple power bank (from photo)
        const accentMat     = mkMat({ color: 0xc6ff3d, roughness: 0.25, metalness: 0.40, emissive: new THREE.Color(0x4a7800), emissiveIntensity: 0.7 }); // lime indicator
        const redLedMat     = mkMat({ color: 0xff2222, roughness: 0.10, metalness: 0.0,  emissive: new THREE.Color(0xff0000), emissiveIntensity: 3.5 });
        const blueLedMat    = mkMat({ color: 0x38bdf8, roughness: 0.10, metalness: 0.0,  emissive: new THREE.Color(0x0284c7), emissiveIntensity: 3.5 });
        const gpsMat        = mkMat({ color: 0xf1f5f9, roughness: 0.40, metalness: 0.10 }); // GPS tower white plastic
        const spotLightMat  = mkMat({ color: 0xffffff, roughness: 0.10, metalness: 0.10, emissive: new THREE.Color(0xfff5c0), emissiveIntensity: 4.5 }); // searchlight lens
        const lcdScreenMat  = mkMat({ color: 0x14532d, roughness: 0.40, metalness: 0.05, emissive: new THREE.Color(0x22c55e), emissiveIntensity: 1.4 }); // 16x2 green LCD screen
        const wireRed       = mkMat({ color: 0xef4444, roughness: 0.6, metalness: 0.1 });
        const wireYellow    = mkMat({ color: 0xeab308, roughness: 0.6, metalness: 0.1 });
        const wireBlue      = mkMat({ color: 0x3b82f6, roughness: 0.6, metalness: 0.1 });
        const wireBlack     = mkMat({ color: 0x111827, roughness: 0.6, metalness: 0.1 });
        const wireWhite     = mkMat({ color: 0xe5e7eb, roughness: 0.6, metalness: 0.1 });
        const wireOrange    = mkMat({ color: 0xf97316, roughness: 0.6, metalness: 0.1 });

        // ── ROOT GROUP ──
        const root = new THREE.Group();
        scene.add(root);

        // ═══════════════════════════════════════════════════════════════════
        // ROVER CHASSIS & LOWER DECK
        // ═══════════════════════════════════════════════════════════════════
        const chassisGroup = new THREE.Group();
        root.add(chassisGroup);

        // Top Main Deck Plate (white oval/curved edge)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.10, 3.8), chassisMat);
        deck.position.set(0, 0, 0);
        deck.castShadow = true;
        deck.receiveShadow = true;
        chassisGroup.add(deck);

        // Lower chassis plate (base deck)
        const lowerPlate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 3.4), chassisMat);
        lowerPlate.position.set(0, -0.42, 0);
        lowerPlate.castShadow = true;
        chassisGroup.add(lowerPlate);

        // 4 Corner Structural Wooden/Dark Standoffs (as visible in real photo)
        const standoffCorners = [
            { x: -1.02, z: -1.65 },
            { x:  1.02, z: -1.65 },
            { x: -1.02, z:  1.65 },
            { x:  1.02, z:  1.65 },
        ];
        standoffCorners.forEach(({ x, z }) => {
            const standoff = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), chassisWood);
            standoff.position.set(x, -0.21, z);
            standoff.castShadow = true;
            chassisGroup.add(standoff);

            // Stainless steel hex bolt on top of deck
            const boltHead = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 6), silverMat);
            boltHead.position.set(x, 0.065, z);
            chassisGroup.add(boltHead);

            // Bolt washer
            const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14), silverMat);
            washer.position.set(x, 0.054, z);
            chassisGroup.add(washer);
        });

        // Lower Electronics Bay: Red L298N Motor Driver Board with Silver Heat Sink
        const motorDriverGrp = new THREE.Group();
        motorDriverGrp.position.set(0.0, -0.34, 0.2);
        chassisGroup.add(motorDriverGrp);

        const motorDriverPcb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.65), pcbRedMat);
        motorDriverGrp.add(motorDriverPcb);

        // Aluminum finned heat sink on motor driver
        const sinkBase = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.14, 0.18), silverMat);
        sinkBase.position.set(0, 0.08, 0);
        motorDriverGrp.add(sinkBase);
        for (let fi = -3; fi <= 3; fi++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.015), silverMat);
            fin.position.set(0, 0.10, fi * 0.026);
            motorDriverGrp.add(fin);
        }

        // ── 4 WHEELS (White dished hubs + Deep rubber treads from photo) ──
        const wheelConfigs = [
            { x:  1.38, z:  1.42 },
            { x: -1.38, z:  1.42 },
            { x:  1.38, z: -1.42 },
            { x: -1.38, z: -1.42 },
        ];

        const mkWheel = (wx: number, wz: number) => {
            const wGrp = new THREE.Group();
            wGrp.position.set(wx, -0.42, wz);

            // Heavy Rubber Tyre
            const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 32), tireMat);
            tyre.rotation.z = Math.PI / 2;
            tyre.castShadow = true;
            wGrp.add(tyre);

            // Rugged Tread Ridges
            for (let i = 0; i < 18; i++) {
                const ang = (i / 18) * Math.PI * 2;
                const r = 0.455;
                const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.038, 0.055), tireMat);
                ridge.position.set(0, r * Math.cos(ang), r * Math.sin(ang));
                ridge.rotation.x = ang;
                tyre.add(ridge);
            }

            // White Concave Aero Dished Rim (iconic from photo!)
            const dishSign = wx > 0 ? 1 : -1;
            const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.12, 24), dishRimMat);
            dish.rotation.z = (Math.PI / 2) * dishSign;
            dish.position.set(dishSign * 0.11, 0, 0);
            wGrp.add(dish);

            // Center hub cap & hex nut
            const hubNut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), darkMat);
            hubNut.rotation.z = Math.PI / 2;
            hubNut.position.set(dishSign * 0.17, 0, 0);
            wGrp.add(hubNut);

            // Axle shaft into chassis
            const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12), silverMat);
            axle.rotation.z = Math.PI / 2;
            axle.position.set(-dishSign * 0.12, 0, 0);
            wGrp.add(axle);

            chassisGroup.add(wGrp);
        };
        wheelConfigs.forEach(({ x, z }) => mkWheel(x, z));

        // ═══════════════════════════════════════════════════════════════════
        // TOP DECK: HARDWARE & SENSORS (FULLY EQUIPPED)
        // ═══════════════════════════════════════════════════════════════════

        // 1. TALL SLOTTED GPS MAST TOWER (Prominent in real photo!)
        const gpsTowerGrp = new THREE.Group();
        gpsTowerGrp.position.set(0.32, 0.05, 0.95);
        chassisGroup.add(gpsTowerGrp);

        // Mast Base Mount Plate
        const mastBase = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 0.30), gpsMat);
        mastBase.position.set(0, 0.02, 0);
        gpsTowerGrp.add(mastBase);

        // Slotted White Mast Column (1.1m tall)
        const mastHeight = 1.15;
        const mastPillar1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, mastHeight, 0.12), gpsMat);
        mastPillar1.position.set(-0.06, mastHeight / 2, 0);
        gpsTowerGrp.add(mastPillar1);

        const mastPillar2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, mastHeight, 0.12), gpsMat);
        mastPillar2.position.set(0.06, mastHeight / 2, 0);
        gpsTowerGrp.add(mastPillar2);

        // Cross-struts on mast
        for (let ci = 1; ci <= 4; ci++) {
            const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.08), gpsMat);
            strut.position.set(0, ci * 0.22, 0);
            gpsTowerGrp.add(strut);
        }

        // Top GPS Platform Plate
        const topGpsPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.32), gpsMat);
        topGpsPlate.position.set(0, mastHeight + 0.02, 0);
        gpsTowerGrp.add(topGpsPlate);

        // Ceramic Patch Antenna (White square ceramic with metallic core)
        const gpsPatch = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.24), mkMat({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.15 }));
        gpsPatch.position.set(0, mastHeight + 0.06, 0);
        gpsTowerGrp.add(gpsPatch);

        const gpsPatchCore = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 12), silverMat);
        gpsPatchCore.position.set(0, mastHeight + 0.082, 0);
        gpsTowerGrp.add(gpsPatchCore);

        // Black Coaxial Cable running down the mast
        const mastCoax = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, mastHeight + 0.05, 8), darkMat);
        mastCoax.position.set(0.07, mastHeight / 2, 0.05);
        gpsTowerGrp.add(mastCoax);

        // 2. METALLIC PURPLE/BRONZE POWER BANK (Central in real photo!)
        const powerBankGrp = new THREE.Group();
        powerBankGrp.position.set(0.0, 0.05, 0.38);
        chassisGroup.add(powerBankGrp);

        // Main Curved Battery Body
        const pbBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.82), powerBankMat);
        pbBody.position.set(0, 0.07, 0);
        pbBody.castShadow = true;
        powerBankGrp.add(pbBody);

        // Rounded side edges of power bank
        for (const sx of [-1, 1]) {
            const pbEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.82, 16), powerBankMat);
            pbEdge.position.set(sx * 0.24, 0.07, 0);
            pbEdge.rotation.x = Math.PI / 2;
            powerBankGrp.add(pbEdge);
        }

        // Blue LED Battery Level Indicator Dots (4 dots)
        for (let di = 0; di < 4; di++) {
            const ledDot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), blueLedMat);
            ledDot.position.set(-0.06 + di * 0.04, 0.142, 0.25);
            powerBankGrp.add(ledDot);
        }

        // USB Output Port Cutouts (white inserts)
        for (const ux of [-0.08, 0.08]) {
            const usbPort = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.02), wireWhite);
            usbPort.position.set(ux, 0.07, 0.412);
            powerBankGrp.add(usbPort);
        }

        // USB Cables plugged into power bank
        const usbPlug = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), wireWhite);
        usbPlug.position.set(0.08, 0.07, 0.46);
        powerBankGrp.add(usbPlug);

        // 3. ELEVATED RASPBERRY PI 4 WITH GOLDEN BRASS FAN (From photo!)
        const piGrp = new THREE.Group();
        piGrp.position.set(0.64, 0.05, 0.35);
        chassisGroup.add(piGrp);

        // 4 Acrylic standoffs
        for (const [px, pz] of [[-0.28, -0.42], [0.28, -0.42], [-0.28, 0.42], [0.28, 0.42]]) {
            const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), brassMat);
            standoff.position.set(px, 0.04, pz);
            piGrp.add(standoff);
        }

        // Clear Acrylic Riser Plate
        const piAcrylic = new THREE.Mesh(
            new THREE.BoxGeometry(0.64, 0.02, 0.94),
            mkMat({ color: 0xd0e8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6 })
        );
        piAcrylic.position.set(0, 0.08, 0);
        piGrp.add(piAcrylic);

        // Green Raspberry Pi PCB Board
        const piPcb = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.88), pcbGreenMat);
        piPcb.position.set(0, 0.10, 0);
        piGrp.add(piPcb);

        // Golden/Brass Heatsink Base with Circular Well
        const sinkGeo = new THREE.BoxGeometry(0.38, 0.07, 0.38);
        const piSink = new THREE.Mesh(sinkGeo, brassMat);
        piSink.position.set(0, 0.15, 0.02);
        piGrp.add(piSink);

        // Circular Gold Fan Well Ring
        const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 12, 24), brassMat);
        fanRing.position.set(0, 0.185, 0.02);
        fanRing.rotation.x = Math.PI / 2;
        piGrp.add(fanRing);

        // Fan Blades Group (ANIMATED SPINNING!)
        const fanBlades = new THREE.Group();
        fanBlades.position.set(0, 0.185, 0.02);
        piGrp.add(fanBlades);
        fanBladesRef.current = fanBlades;

        // 7 Fan Blades
        for (let b = 0; b < 7; b++) {
            const ang = (b / 7) * Math.PI * 2;
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.12), darkMat);
            blade.position.set(0.06 * Math.cos(ang), 0, 0.06 * Math.sin(ang));
            blade.rotation.y = ang + 0.35;
            fanBlades.add(blade);
        }
        // Fan center cap
        const fanCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), brassMat);
        fanBlades.add(fanCap);

        // Silver Dual-Stack USB 3.0 Ports (pointing outward right)
        for (const uz of [-0.22, -0.04]) {
            const usbBlock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.13), silverMat);
            usbBlock.position.set(0.25, 0.17, uz);
            piGrp.add(usbBlock);

            // Blue USB 3.0 inserts
            const usbInsert = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.035, 0.09), armBlueMat);
            usbInsert.position.set(0.33, 0.17, uz);
            piGrp.add(usbInsert);
        }

        // RJ45 Ethernet Port Block
        const ethBlock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.15), silverMat);
        ethBlock.position.set(0.25, 0.16, 0.22);
        piGrp.add(ethBlock);

        // 40-Pin GPIO Header Strip with colored pins
        const gpioStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.52), darkMat);
        gpioStrip.position.set(-0.24, 0.14, 0.05);
        piGrp.add(gpioStrip);

        // Jumper wires sprouting from GPIO
        for (let j = 0; j < 5; j++) {
            const jWire = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), j % 2 === 0 ? wireYellow : wireRed);
            jWire.position.set(-0.24, 0.20, -0.12 + j * 0.06);
            jWire.rotation.z = 0.3;
            piGrp.add(jWire);
        }

        // 4. 16x2 GREEN BACKLIT LCD DISPLAY (Tilted towards viewer from photo!)
        const lcdGrp = new THREE.Group();
        lcdGrp.position.set(-0.62, 0.06, 0.32);
        lcdGrp.rotation.x = -0.22; // subtle ergonomic tilt
        chassisGroup.add(lcdGrp);

        // Black LCD Bezel Housing
        const lcdHousing = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.36), darkMat);
        lcdHousing.position.set(0, 0.03, 0);
        lcdGrp.add(lcdHousing);

        // 4 Bezel corner screws
        for (const [lx, lz] of [[-0.29, -0.14], [0.29, -0.14], [-0.29, 0.14], [0.29, 0.14]]) {
            const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 8), silverMat);
            scr.position.set(lx, 0.065, lz);
            lcdGrp.add(scr);
        }

        // Glowing Green LCD Glass
        const lcdScreen = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.22), lcdScreenMat);
        lcdScreen.position.set(0, 0.062, 0);
        lcdGrp.add(lcdScreen);

        // Pixel Character Text lines simulation (dark contrast matrix blocks)
        for (let row = -0.04; row <= 0.04; row += 0.08) {
            for (let ch = -0.21; ch <= 0.21; ch += 0.032) {
                const charBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.05), darkMat);
                charBlock.position.set(ch, 0.073, row);
                lcdGrp.add(charBlock);
            }
        }

        // I2C Backpack Board mounted on the rear of LCD
        const i2cBoard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.16), pcbBlueMat);
        i2cBoard.position.set(0, -0.02, 0);
        lcdGrp.add(i2cBoard);

        // 5. PCA9685 16-CHANNEL SERVO DRIVER BOARD (Between Pi, Arm and LCD)
        const pcaGrp = new THREE.Group();
        pcaGrp.position.set(0.12, 0.05, -0.42);
        chassisGroup.add(pcaGrp);

        const pcaPcb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.52), pcbBlueMat);
        pcaPcb.position.set(0, 0.02, 0);
        pcaGrp.add(pcaPcb);

        // Electrolytic power capacitor (silver can)
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), silverMat);
        cap.position.set(-0.10, 0.07, -0.18);
        pcaGrp.add(cap);

        // Blue power terminal block
        const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.12), pcbBlueMat);
        terminal.position.set(0.10, 0.06, -0.18);
        pcaGrp.add(terminal);

        // 3-pin servo headers (colored black/red/yellow pins)
        for (let h = -0.12; h <= 0.16; h += 0.045) {
            const pinRow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.025), darkMat);
            pinRow.position.set(0, 0.05, h);
            pcaGrp.add(pinRow);
        }

        // 6. 360° BORDER SURVEILLANCE LIDAR PUCK (Front-Right Top Deck)
        const lidarGrp = new THREE.Group();
        lidarGrp.position.set(0.62, 0.05, -1.05);
        chassisGroup.add(lidarGrp);

        // Riser Base Mount
        const lidarRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.14, 24), darkMat);
        lidarRiser.position.set(0, 0.07, 0);
        lidarGrp.add(lidarRiser);

        // Rotating LiDAR Scanner Head (ANIMATED SPINNING!)
        const lidarHead = new THREE.Group();
        lidarHead.position.set(0, 0.14, 0);
        lidarGrp.add(lidarHead);
        lidarHeadRef.current = lidarHead;

        const lidarTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.16, 24), darkMat);
        lidarTurret.position.set(0, 0.08, 0);
        lidarHead.add(lidarTurret);

        // Smoked Glass Optical Band with laser window
        const lidarGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.205, 0.205, 0.07, 24),
            mkMat({ color: 0x0a1018, roughness: 0.1, metalness: 0.8, emissive: new THREE.Color(0x0284c7), emissiveIntensity: 0.6 })
        );
        lidarGlass.position.set(0, 0.08, 0);
        lidarHead.add(lidarGlass);

        // Optical emitter slit
        const lidarAperture = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.22), accentMat);
        lidarAperture.position.set(0, 0.08, 0);
        lidarHead.add(lidarAperture);

        // 7. FRONT-LEFT PAN/TILT SURVEILLANCE CAMERA (Visible in real photo!)
        const panCamGrp = new THREE.Group();
        panCamGrp.position.set(-1.18, -0.05, -1.68);
        chassisGroup.add(panCamGrp);

        // Outrigger Bracket
        const camBracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.20), darkMat);
        camBracket.position.set(0.04, 0, 0);
        panCamGrp.add(camBracket);

        // Pan Servo Rotating Group (ANIMATED PANNING)
        const panNode = new THREE.Group();
        panNode.position.set(0, 0.03, 0);
        panCamGrp.add(panNode);
        panCamRef.current = panNode;

        const panServoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), servoBlackMat);
        panNode.add(panServoMesh);

        // Tilt Servo U-Bracket (ANIMATED TILTING)
        const tiltNode = new THREE.Group();
        tiltNode.position.set(0, 0.12, 0);
        panNode.add(tiltNode);
        tiltCamRef.current = tiltNode;

        // Camera Body
        const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), darkMat);
        camBody.position.set(0, 0.04, -0.04);
        tiltNode.add(camBody);

        // Optical Lens Barrel
        const camLensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 16), darkMat);
        camLensBarrel.rotation.x = Math.PI / 2;
        camLensBarrel.position.set(0, 0.04, -0.13);
        tiltNode.add(camLensBarrel);

        // Coated Camera Glass Element
        const camGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16),
            mkMat({ color: 0x031830, roughness: 0.05, metalness: 0.9, emissive: new THREE.Color(0x0284c7), emissiveIntensity: 1.2 })
        );
        camGlass.rotation.x = Math.PI / 2;
        camGlass.position.set(0, 0.04, -0.172);
        tiltNode.add(camGlass);

        // Blinking Red Recording LED on camera
        const camRecLed = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), redLedMat);
        camRecLed.position.set(0.06, 0.08, -0.11);
        tiltNode.add(camRecLed);

        // 8. DUAL TACTICAL HIGH-INTENSITY LED SEARCHLIGHTS (Front Bumper)
        for (const sx of [-0.65, 0.65]) {
            const spotGrp = new THREE.Group();
            spotGrp.position.set(sx, 0.12, -1.86);
            chassisGroup.add(spotGrp);

            // Spotlight Aluminum Housing
            const spotBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.20, 20), darkMat);
            spotBody.rotation.x = Math.PI / 2;
            spotGrp.add(spotBody);

            // Cooling Ribs
            for (let ri = -1; ri <= 1; ri++) {
                const rib = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.015, 8, 20), silverMat);
                rib.position.set(0, 0, ri * 0.06);
                spotGrp.add(rib);
            }

            // Emissive Xenon Lens Face
            const spotLens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), spotLightMat);
            spotLens.rotation.x = Math.PI / 2;
            spotLens.position.set(0, 0, -0.10);
            spotGrp.add(spotLens);

            // Lens Protective Grille Bar
            const barH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.01), darkMat);
            barH.position.set(0, 0, -0.115);
            spotGrp.add(barH);
        }

        // 9. HC-SR04 ULTRASONIC SENSOR "EYES" (Center Front Bumper)
        const sonarGrp = new THREE.Group();
        sonarGrp.position.set(0, 0.07, -1.88);
        chassisGroup.add(sonarGrp);

        const sonarPcb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.025), pcbBlueMat);
        sonarGrp.add(sonarPcb);

        for (const ex of [-0.09, 0.09]) {
            const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16), silverMat);
            eye.rotation.x = Math.PI / 2;
            eye.position.set(ex, 0, -0.04);
            sonarGrp.add(eye);

            const meshScreen = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), darkMat);
            meshScreen.position.set(ex, 0, -0.071);
            sonarGrp.add(meshScreen);
        }

        // 10. REAR TELEMETRY LORA WHIP ANTENNA WITH BRASS SMA CONNECTOR
        const loraGrp = new THREE.Group();
        loraGrp.position.set(-0.48, 0.05, 1.25);
        chassisGroup.add(loraGrp);

        // Brass SMA Hex Nut & Base
        const smaNut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6), brassMat);
        smaNut.position.set(0, 0.03, 0);
        loraGrp.add(smaNut);

        // Antenna Loading Coil (thick ribbed base)
        const antCoil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), darkMat);
        antCoil.position.set(0, 0.16, 0);
        loraGrp.add(antCoil);

        // Long Flexible Carbon Whip Rod (1.35m tall!)
        const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 1.35, 8), darkMat);
        whip.position.set(0, 0.92, 0);
        loraGrp.add(whip);

        // Lime Accent Antenna Tip
        const whipTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), accentMat);
        whipTip.position.set(0, 1.60, 0);
        loraGrp.add(whipTip);

        // 11. SECONDARY 2.4GHz RUBBER DUCK ANTENNA (Articulated at 35°)
        const wifiAntGrp = new THREE.Group();
        wifiAntGrp.position.set(-0.76, 0.05, 1.05);
        wifiAntGrp.rotation.z = -0.35;
        chassisGroup.add(wifiAntGrp);

        const wifiBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), darkMat);
        wifiBase.position.set(0, 0.03, 0);
        wifiAntGrp.add(wifiBase);

        const wifiRod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.55, 12), darkMat);
        wifiRod.position.set(0, 0.32, 0);
        wifiAntGrp.add(wifiRod);

        // 12. EMERGENCY E-STOP STATION (Safety Yellow / Red Mushroom)
        const estopGrp = new THREE.Group();
        estopGrp.position.set(-0.80, 0.05, 1.48);
        chassisGroup.add(estopGrp);

        // Yellow Safety Box
        const estopBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.16, 0.24),
            mkMat({ color: 0xf59e0b, roughness: 0.35, metalness: 0.10 })
        );
        estopBox.position.set(0, 0.08, 0);
        estopGrp.add(estopBox);

        // Yellow Warning Collar Ring
        const estopCollar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.09, 0.04, 16),
            mkMat({ color: 0xfbbf24, roughness: 0.3, metalness: 0.1 })
        );
        estopCollar.position.set(0, 0.18, 0);
        estopGrp.add(estopCollar);

        // Big Red Mushroom Push-Button
        const estopBtn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.085, 0.07, 0.06, 18),
            mkMat({ color: 0xdc2626, roughness: 0.2, metalness: 0.2, emissive: new THREE.Color(0x7f1d1d), emissiveIntensity: 0.3 })
        );
        estopBtn.position.set(0, 0.22, 0);
        estopGrp.add(estopBtn);

        // 13. REAR TACTICAL AUXILIARY ELECTRONICS ENCLOSURE / TOOL BAY
        const auxEnclosureGrp = new THREE.Group();
        auxEnclosureGrp.position.set(0.60, 0.05, 1.45);
        chassisGroup.add(auxEnclosureGrp);

        const auxBox = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.44), darkMat);
        auxBox.position.set(0, 0.09, 0);
        auxEnclosureGrp.add(auxBox);

        // Aluminum Heat Dissipation Fins on top
        for (let fi = -3; fi <= 3; fi++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.02), silverMat);
            fin.position.set(0, 0.19, fi * 0.055);
            auxEnclosureGrp.add(fin);
        }

        // Waterproof Cable Glands on side of box
        for (const gz of [-0.10, 0.10]) {
            const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10), silverMat);
            gland.rotation.z = Math.PI / 2;
            gland.position.set(-0.28, 0.09, gz);
            auxEnclosureGrp.add(gland);
        }

        // 14. MULTI-COLOR JUMPER WIRE HARNESSES (Rainbow ribbons throughout deck!)
        const wireRibbons: [number, number, number, number, number, number, THREE.MeshStandardMaterial][] = [
            // From Pi to LCD
            [ 0.35, 0.09, 0.35, -0.30, 0.09, 0.35, wireYellow ],
            [ 0.35, 0.08, 0.32, -0.30, 0.08, 0.32, wireBlue ],
            [ 0.35, 0.07, 0.29, -0.30, 0.07, 0.29, wireRed ],
            // From Power bank to Pi
            [ 0.08, 0.08, 0.48,  0.35, 0.08, 0.48, wireWhite ],
            [ 0.08, 0.07, 0.52,  0.35, 0.07, 0.52, wireBlack ],
            // From PCA9685 to Arm Base
            [ 0.10, 0.08, -0.40, -0.35, 0.08, -0.55, wireOrange ],
            [ 0.10, 0.07, -0.44, -0.35, 0.07, -0.58, wireRed ],
            [ 0.10, 0.06, -0.48, -0.35, 0.06, -0.61, wireBlack ],
            // From GPS mast to Board
            [ 0.32, 0.08, 0.85,  0.45, 0.08, 0.45, wireBlack ],
        ];

        wireRibbons.forEach(([x1, y1, z1, x2, y2, z2, mat]) => {
            const p1 = new THREE.Vector3(x1, y1, z1);
            const p2 = new THREE.Vector3(x2, y2, z2);
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            mid.y += 0.02; // slight natural arch

            const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
            const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.012, 6, false);
            const wireMesh = new THREE.Mesh(tubeGeo, mat);
            chassisGroup.add(wireMesh);
        });

        // 15. REAR TACTICAL LED STRIP & DUAL TAILLIGHTS
        const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.02, 0.03), accentMat);
        ledStrip.position.set(0, 0.05, 1.89);
        chassisGroup.add(ledStrip);

        for (const tx of [-0.88, 0.88]) {
            const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), redLedMat);
            tailLight.position.set(tx, 0.02, 1.895);
            chassisGroup.add(tailLight);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 6-DOF ROBOTIC ARM & 3-FINGER BIONIC HAND (From real photo!)
        // ═══════════════════════════════════════════════════════════════════
        const ARM_X = -0.58;
        const ARM_Z = -0.72;

        // Circular Blue Cutout Ring on Deck (As seen in photo!)
        const armCutoutRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 16, 32), armBlueMat);
        armCutoutRing.position.set(ARM_X, 0.06, ARM_Z);
        armCutoutRing.rotation.x = Math.PI / 2;
        chassisGroup.add(armCutoutRing);

        // Mounting Screws around ring
        for (let ri = 0; ri < 8; ri++) {
            const rang = (ri / 8) * Math.PI * 2;
            const rscr = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6), silverMat);
            rscr.position.set(ARM_X + 0.32 * Math.cos(rang), 0.08, ARM_Z + 0.32 * Math.sin(rang));
            chassisGroup.add(rscr);
        }

        // Base Turret Mount Disc
        const armMountDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.08, 24), darkMat);
        armMountDisc.position.set(ARM_X, 0.08, ARM_Z);
        chassisGroup.add(armMountDisc);

        // ── JOINT 1: Base Yaw Rotation (rotates around Y) ──
        const baseGrp = new THREE.Group();
        baseGrp.position.set(ARM_X, 0.12, ARM_Z);
        chassisGroup.add(baseGrp);
        baseGrpRef.current = baseGrp;

        // Base Servo Housing (MG996R servo casing + blue bracket)
        const baseServo = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.26), armBlueMat);
        baseServo.position.set(0, 0.10, 0);
        baseGrp.add(baseServo);

        const baseMotorBlock = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.20), servoBlackMat);
        baseMotorBlock.position.set(0, 0.10, 0);
        baseGrp.add(baseMotorBlock);

        // ── JOINT 2: Shoulder Pitch (rotates around X) ──
        const shoulderGrp = new THREE.Group();
        shoulderGrp.position.set(0, 0.20, 0);
        baseGrp.add(shoulderGrp);
        shoulderGrpRef.current = shoulderGrp;

        // Shoulder dual brackets & servo horn
        for (const sx of [-1, 1]) {
            const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16), servoGreyMat);
            horn.rotation.z = Math.PI / 2;
            horn.position.set(sx * 0.13, 0, 0);
            shoulderGrp.add(horn);
        }

        // Upper Arm Link (Blue 3D printed beam with cutouts)
        const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.18), armBlueMat);
        upperArm.position.set(0, 0.44, 0);
        upperArm.castShadow = true;
        shoulderGrp.add(upperArm);

        // Arm Cable Guide & Servo Wire (Orange/Brown ribbon along arm)
        const armWire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6), wireOrange);
        armWire.position.set(0.10, 0.44, 0.05);
        shoulderGrp.add(armWire);

        // ── JOINT 3: Elbow Pitch (rotates around X) ──
        const elbowGrp = new THREE.Group();
        elbowGrp.position.set(0, 0.88, 0);
        shoulderGrp.add(elbowGrp);
        elbowGrpRef.current = elbowGrp;

        // Elbow MG996R Black Servo Block
        const elbowServo = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), servoBlackMat);
        elbowGrp.add(elbowServo);

        // Forearm Link (Blue beam with white servo bracket)
        const foreArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.72, 0.15), armBlueMat);
        foreArm.position.set(0, 0.36, 0);
        foreArm.castShadow = true;
        elbowGrp.add(foreArm);

        // ── JOINT 4: Wrist Pitch (rotates around X) ──
        const wristPitchGrp = new THREE.Group();
        wristPitchGrp.position.set(0, 0.72, 0);
        elbowGrp.add(wristPitchGrp);
        wristPitchGrpRef.current = wristPitchGrp;

        const wristPitchServo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.18), armWhiteMat);
        wristPitchGrp.add(wristPitchServo);

        // ── JOINT 5: Wrist Roll / Palm (rotates around Y) ──
        const palmGrp = new THREE.Group();
        palmGrp.position.set(0, 0.18, 0);
        wristPitchGrp.add(palmGrp);
        gripperGrpRef.current = palmGrp;

        // Palm Base (White 3D printed hand chassis)
        const palmBase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), armWhiteMat);
        palmGrp.add(palmBase);

        // Inspection Micro-Camera on Wrist Palm
        const wristCam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), darkMat);
        wristCam.position.set(0, 0.06, 0.10);
        palmGrp.add(wristCam);
        const wristLens = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12), mkMat({ color: 0x0284c7, roughness: 0.1, metalness: 0.9 }));
        wristLens.rotation.x = Math.PI / 2;
        wristLens.position.set(0, 0.06, 0.15);
        palmGrp.add(wristLens);

        // ── JOINT 6: BIONIC 3-FINGER HAND (White linkages + Blue finger caps from photo!) ──
        const mkFinger = (ox: number, oz: number, isThumb: boolean) => {
            const fMesh = new THREE.Group();
            fMesh.position.set(ox, 0.08, oz);

            // Knuckle joint (white)
            const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), servoGreyMat);
            knuckle.rotation.z = Math.PI / 2;
            fMesh.add(knuckle);

            // Proximal Phalanx Link (White)
            const link1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.05), armWhiteMat);
            link1.position.set(0, 0.09, 0);
            fMesh.add(link1);

            // Distal Phalanx Link with Blue Rubberized Tip Cap (Iconic from photo!)
            const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.045), armBlueMat);
            link2.position.set(0, 0.22, isThumb ? 0.02 : -0.02);
            fMesh.add(link2);

            // Tactile Finger Tip Cap
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), armBlueMat);
            tip.position.set(0, 0.29, isThumb ? 0.02 : -0.02);
            fMesh.add(tip);

            palmGrp.add(fMesh);
            return fMesh as unknown as THREE.Mesh;
        };

        finger1Ref.current     = mkFinger(-0.07, -0.04, false); // Index finger
        finger2Ref.current     = mkFinger( 0.07, -0.04, false); // Middle finger
        fingerThumbRef.current = mkFinger( 0.00,  0.06, true);  // Opposing Thumb

        // ═══════════════════════════════════════════════════════════════════
        // TACTICAL GROUND GRID & RINGS
        // ═══════════════════════════════════════════════════════════════════
        const grid = new THREE.GridHelper(24, 32, 0x3b82f6, 0x172338);
        grid.position.y = -1.0;
        scene.add(grid);

        // Radar Range Rings
        const mkRing = (r1: number, r2: number, col: number, op: number) => {
            const m = new THREE.Mesh(
                new THREE.RingGeometry(r1, r2, 64).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide })
            );
            m.position.y = -0.99;
            scene.add(m);
        };
        mkRing(3.8,  3.84, 0xc6ff3d, 0.28);
        mkRing(7.0,  7.04, 0x3b82f6, 0.18);
        mkRing(10.0, 10.04, 0x3b82f6, 0.09);

        // Shadow Receiver Plane
        const shadowPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(28, 28),
            new THREE.ShadowMaterial({ opacity: 0.38 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -1.0;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        // ═══════════════════════════════════════════════════════════════════
        // ANIMATION LOOP (LIVELY AUTONOMOUS PERIMETER SCAN)
        // ═══════════════════════════════════════════════════════════════════
        let animId: number;
        const clock = new THREE.Clock();
        let t = 0;
        const d2r = (d: number) => (d * Math.PI) / 180;

        const animate = () => {
            animId = requestAnimationFrame(animate);
            const delta = clock.getDelta();
            t += delta;

            // Camera auto-orbit
            if (autoRotateRef.current && !isDraggingRef.current) {
                sphericalRef.current.theta += delta * 0.24;
            }

            const { radius, theta, phi } = sphericalRef.current;
            const camX = targetRef.current.x + radius * Math.sin(phi) * Math.sin(theta);
            const camY = targetRef.current.y + radius * Math.cos(phi);
            const camZ = targetRef.current.z + radius * Math.sin(phi) * Math.cos(theta);
            camera.position.set(camX, camY, camZ);
            camera.lookAt(targetRef.current);

            // 1. Spinning Raspberry Pi Heatsink Fan
            if (fanBladesRef.current) {
                fanBladesRef.current.rotation.y += delta * 24;
            }

            // 2. Spinning 360° LiDAR Puck
            if (lidarHeadRef.current) {
                lidarHeadRef.current.rotation.y += delta * 10;
            }

            // 3. Autonomous Front Pan-Tilt Surveillance Camera Scanning
            if (panCamRef.current) {
                panCamRef.current.rotation.y = Math.sin(t * 0.45) * 0.65;
            }
            if (tiltCamRef.current) {
                tiltCamRef.current.rotation.x = Math.sin(t * 0.70) * 0.15 + 0.05;
            }

            // 4. Robotic Arm Autonomous Border Surveillance Reach & Scan
            if (baseGrpRef.current) {
                baseGrpRef.current.rotation.y = d2r(75) + Math.sin(t * 0.28) * d2r(40);
            }
            if (shoulderGrpRef.current) {
                shoulderGrpRef.current.rotation.x = -d2r(50) + Math.sin(t * 0.20 + 0.4) * d2r(16);
            }
            if (elbowGrpRef.current) {
                elbowGrpRef.current.rotation.x = d2r(45) + Math.sin(t * 0.24 + 1.1) * d2r(18);
            }
            if (wristPitchGrpRef.current) {
                wristPitchGrpRef.current.rotation.x = -d2r(22) + Math.sin(t * 0.32 + 2.0) * d2r(14);
            }

            // 5. Bionic Hand Grip Flexing
            const gripWave = 0.5 + 0.5 * Math.sin(t * 0.55);
            const spread = gripWave * 0.06;
            if (finger1Ref.current) finger1Ref.current.position.x = -0.06 - spread;
            if (finger2Ref.current) finger2Ref.current.position.x =  0.06 + spread;
            if (fingerThumbRef.current) fingerThumbRef.current.position.z = 0.05 + spread * 0.8;

            // 6. Under-glow & Status LEDs Pulsing
            underGlow.intensity = 1.6 + 0.4 * Math.sin(t * 2.2);
            if (accentMat) accentMat.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 3.8);

            const degYaw = THREE.MathUtils.radToDeg(sphericalRef.current.theta) % 360;
            setHudData({ yaw: Math.round((degYaw + 360) % 360), dist: Math.round(radius * 10) / 10 });

            renderer.render(scene, camera);
        };
        animate();

        const resizeObs = new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (!w || !h) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });
        resizeObs.observe(container);

        return () => {
            cancelAnimationFrame(animId);
            resizeObs.disconnect();
            if (renderer.domElement && container.contains(renderer.domElement))
                container.removeChild(renderer.domElement);
            renderer.dispose();
            scene.clear();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Pointer Handlers (Smooth Orbit & Pan) ────────────────────────────────
    const handlePointerDown = (e: React.PointerEvent) => {
        isDraggingRef.current = true;
        dragModeRef.current = e.button === 2 ? "pan" : "rotate";
        prevPtrRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        if (autoRotateRef.current) setAutoRotate(false);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - prevPtrRef.current.x;
        const dy = e.clientY - prevPtrRef.current.y;
        prevPtrRef.current = { x: e.clientX, y: e.clientY };
        if (dragModeRef.current === "rotate") {
            sphericalRef.current.theta -= dx * 0.008;
            sphericalRef.current.phi = Math.max(0.06, Math.min(Math.PI / 2 + 0.42, sphericalRef.current.phi - dy * 0.008));
        } else {
            const f = 0.004 * sphericalRef.current.radius;
            targetRef.current.x -= dx * f;
            targetRef.current.y += dy * f;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDraggingRef.current = false;
        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        sphericalRef.current.radius = Math.max(2.5, Math.min(22, sphericalRef.current.radius + e.deltaY * 0.006));
    };

    // ── JSX Output ───────────────────────────────────────────────────────────
    return (
        <div
            style={{
                width: "100%",
                height: typeof height === "number" ? `${height}px` : height,
                position: "relative",
                background: "radial-gradient(ellipse at center, #111822 0%, #06080c 100%)",
                borderRadius: 8,
                overflow: "hidden",
                userSelect: "none",
                touchAction: "none",
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Three.js canvas mount */}
            <div
                ref={mountRef}
                style={{ width: "100%", height: "100%", cursor: "grab" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
            />

            {/* Targeting HUD Crosshairs */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", opacity: 0.16 }}>
                <div style={{ width: 48, height: 48, border: "1px dashed #C6FF3D", borderRadius: "50%" }} />
                <div style={{ position: "absolute", top: "50%", left: -8,  width: 64, height: 1, background: "#C6FF3D", transform: "translateY(-50%)" }} />
                <div style={{ position: "absolute", left: "50%", top: -8, width: 1,  height: 64, background: "#C6FF3D", transform: "translateX(-50%)" }} />
            </div>

            {/* ── TOP-LEFT BADGE ── */}
            <div style={{ position: "absolute", top: 10, left: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
                <div style={{ background: "rgba(8,13,20,0.92)", border: "1px solid rgba(198,255,61,0.35)", borderRadius: 4, padding: "4px 10px", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C6FF3D", boxShadow: "0 0 8px #C6FF3D", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: 1.4 }}>
                        ABSR ROVER · ARM DIGITAL TWIN
                    </span>
                    <span style={{ fontSize: 9, color: "#666" }}>|</span>
                    <span style={{ fontSize: 9, color: "#C6FF3D", letterSpacing: 1 }}>LIVE 3D</span>
                </div>
            </div>

            {/* ── TOP-CENTER BADGE ── */}
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none" }}>
                <div style={{ background: "rgba(6,10,18,0.85)", border: "1px solid rgba(198,255,61,0.28)", borderRadius: 20, padding: "3px 14px", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#C6FF3D", letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>360°</span>
                    <span style={{ fontSize: 8, color: "#666", letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>3D MODEL</span>
                </div>
            </div>

            {/* ── TOP-RIGHT CONTROLS ── */}
            <div style={{ position: "absolute", top: 10, right: 12, zIndex: 10, display: "flex", gap: 6 }}>
                <button onClick={() => setAutoRotate(a => !a)} title="Toggle Auto Rotation"
                    style={{ background: autoRotate ? "rgba(198,255,61,0.18)" : "rgba(12,18,26,0.85)", border: `1px solid ${autoRotate ? "rgba(198,255,61,0.5)" : "#2c2c2c"}`, color: autoRotate ? "#C6FF3D" : "#777", padding: "4px 8px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, backdropFilter: "blur(6px)", letterSpacing: 1 }}>
                    <RotateCw size={11} style={{ animation: autoRotate ? "rover3d-spin 1.4s linear infinite" : "none" }} />
                    <span>{autoRotate ? "AUTO" : "MANUAL"}</span>
                </button>

                <button onClick={resetView} title="Reset View"
                    style={{ background: "rgba(12,18,26,0.85)", border: "1px solid #2c2c2c", color: "#bbb", padding: "4px 8px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, backdropFilter: "blur(6px)" }}>
                    <RotateCcw size={11} /><span>RESET</span>
                </button>

                <div style={{ background: "rgba(12,18,26,0.88)", border: "1px solid #2c2c2c", borderRadius: 4, display: "flex", overflow: "hidden", backdropFilter: "blur(6px)" }}>
                    {(["TACTICAL", "WIREFRAME", "THERMAL"] as DisplayMode[]).map((mode, i) => (
                        <button key={mode} onClick={() => setDisplayMode(mode)}
                            style={{ background: displayMode === mode ? "rgba(59,130,246,0.25)" : "transparent", color: displayMode === mode ? "#60a5fa" : "#666", border: "none", borderRight: i < 2 ? "1px solid #222" : "none", padding: "4px 7px", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", fontWeight: displayMode === mode ? 600 : 400 }}>
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── VIEW PRESETS ── */}
            <div style={{ position: "absolute", top: 48, right: 12, zIndex: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {([
                    { p: "PERSPECTIVE" as ViewPreset, icon: <Layers size={9} /> },
                    { p: "TOP"         as ViewPreset, icon: <Eye size={9} /> },
                    { p: "FRONT"       as ViewPreset, icon: <Crosshair size={9} /> },
                    { p: "SIDE"        as ViewPreset, icon: <Radio size={9} /> },
                    { p: "REAR"        as ViewPreset, icon: <ShieldAlert size={9} /> },
                ]).map(({ p, icon }) => (
                    <button key={p} onClick={() => applyViewPreset(p)}
                        style={{ background: viewPreset === p ? "rgba(59,130,246,0.22)" : "rgba(12,18,26,0.85)", border: `1px solid ${viewPreset === p ? "rgba(59,130,246,0.5)" : "#2c2c2c"}`, color: viewPreset === p ? "#60a5fa" : "#555", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 8, backdropFilter: "blur(6px)", letterSpacing: 1, display: "flex", alignItems: "center", gap: 5 }}>
                        {icon}<span>{p}</span>
                    </button>
                ))}
            </div>

            {/* ── HUD BOTTOM-LEFT ── */}
            <div style={{ position: "absolute", bottom: 10, left: 12, zIndex: 10, background: "rgba(6,10,18,0.92)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 4, padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#9aa", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", gap: 4, minWidth: 175 }}>
                <HudRow icon={<Gauge size={9} />}      label="YAW"    value={`${hudData.yaw}°`}    color="#C6FF3D" />
                <HudRow icon={<Gauge size={9} />}      label="JOINTS" value="6-DOF ACTIVE"          color="#60a5fa" />
                <HudRow icon={<ShieldAlert size={9} />} label="MODE"   value="BORDER PATROL"         color="#a78bfa" />
                <HudRow icon={<Radio size={9} />}      label="DIST"   value={`${hudData.dist} u`}   color="#22c55e" />
                <div style={{ marginTop: 2 }}>
                    <div style={{ fontSize: 7, color: "#556", letterSpacing: 1, marginBottom: 2 }}>ARM REACH</div>
                    <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                        <div style={{ width: "72%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg, #1d4ed8, #C6FF3D)" }} />
                    </div>
                </div>
            </div>

            {/* Controls hint */}
            <div style={{ position: "absolute", bottom: 10, right: 45, zIndex: 10, pointerEvents: "none" }}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                    DRAG TO ORBIT · RIGHT-CLICK PAN · SCROLL ZOOM
                </div>
            </div>

            <style>{`@keyframes rover3d-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function HudRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#445", flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 8, color: "#667", letterSpacing: 1, minWidth: 38 }}>{label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: color || "#fff", letterSpacing: 0.5, marginLeft: "auto" }}>{value}</span>
        </div>
    );
}
