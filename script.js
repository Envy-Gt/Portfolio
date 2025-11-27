import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, canvas);

camera.position.set(-2,2, -2);
camera.lookAt(0, 100, 0);

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
});

// Activer les ombres sur le renderer (à ajouter après la création du renderer)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// -------- Interaction / Raycasting helpers --------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let lastMouseX = 0;
let lastMouseY = 0;
let INTERSECTED_GROUP = null; // currently hovered group
const interactiveGroups = []; // store created groups for quick reference

// Store camera positions for each group
const groupCameraPositions = {
    house_group: { position: new THREE.Vector3(0.5, 1.5, 0.5), target: new THREE.Vector3(0.85, 1.3, 0.3) },
    moule_group: { position: new THREE.Vector3(0.5, 0.8, 0.5), target: new THREE.Vector3(0.55, 0.7, 0.75) },
    ordi_group: { position: new THREE.Vector3(0.05, 0.9, 0.67), target: new THREE.Vector3(0.05, 0.9, 0.85) },    
    golem_group: { position: new THREE.Vector3(0, 0.7, -0.65), target: new THREE.Vector3(0.85, 0.7, -0.65) }
};

// Use label element defined in HTML instead of creating it here
const groupLabel = document.getElementById('group-label');
// message element shown after camera movement
const groupMessage = document.getElementById('group-message');
// escape hint element shown when a group is active
const escapeHint = document.getElementById('escape-hint');

// Messages are now stored in HTML (see #group-message-data). Helper to read them:
function getGroupMessage(groupName) {
    try {
        const el = document.querySelector(`[data-group="${groupName}"]`);
        if (!el) return null;
        // Prefer explicit left/right children when present
        const leftEl = el.querySelector('.msg-left');
        const rightEl = el.querySelector('.msg-right');
        if (leftEl || rightEl) {
            return {
                left: leftEl ? leftEl.innerHTML.trim() : '',
                right: rightEl ? rightEl.innerHTML.trim() : ''
            };
        }
        // fallback: return whole innerHTML as right column
        return { left: '', right: el.innerHTML.trim() };
    } catch (e) {
        return null;
    }
}

let _messageTimer = null;
function showGroupMessage(msgData, duration = 6000) {
    if (!groupMessage) return;
    let left = '', right = '';
    if (!msgData) return;
    if (typeof msgData === 'string') {
        right = msgData;
    } else {
        left = msgData.left || '';
        right = msgData.right || '';
    }

    // build inner two-column structure
    groupMessage.innerHTML = `
        <div class="msg-inner">
            <div class="msg-col msg-left">${left}</div>
            <div class="msg-col msg-right">${right}</div>
         
        </div>
    `;

    groupMessage.classList.remove('hidden');
    groupMessage.classList.add('visible');

}

function hideGroupMessage() {
    if (!groupMessage) return;
    groupMessage.classList.remove('visible');
    groupMessage.classList.add('hidden');
    // clear content after transition for cleanliness
    setTimeout(() => { if (groupMessage) groupMessage.innerHTML = ''; }, 260);
    if (_messageTimer) { clearTimeout(_messageTimer); _messageTimer = null; }
}

function showEscapeHint() {
    if (!escapeHint) return;
    escapeHint.classList.remove('hidden');
    escapeHint.classList.add('visible');
}

function hideEscapeHint() {
    if (!escapeHint) return;
    escapeHint.classList.remove('visible');
    escapeHint.classList.add('hidden');
}

// Camera animation state
let isMovingCamera = false;
let cameraAnimationStartTime = 0;
const CAMERA_ANIMATION_DURATION = 1000; // ms

function findInteractiveGroup(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isInteractiveGroup) return o;
        o = o.parent;
    }
    return null;
}


function setGroupHover(group, hover) {
    if (!group) return;
    group.traverse((c) => {
        if (c.isMesh) {
            if (!c.userData.originalMaterial) c.userData.originalMaterial = c.material;
            if (hover) {
                const m = c.userData.originalMaterial.clone();
                if (m.emissive) {
                    m.emissive = new THREE.Color(0x333333);
                    m.emissiveIntensity = 1;
                }
                c.material = m;
                
            } else {
                if (c.userData.originalMaterial) c.material = c.userData.originalMaterial;
            }
        }
    });
}

function showHoverLabel(group) {
    if (!group) return;

     let name = group.name.replace("_group", "").toUpperCase();
    if (name == "GOLEM")
    {
        name = "SHINING";
    }
    if (name == "ORDI")
    {
        name = "CV";
    }
    if (name == "MOULE")
    {
        name = "MYCOBRICK";
    }

    groupLabel.textContent = name;
    groupLabel.style.left = lastMouseX + "px";
    groupLabel.style.top = (lastMouseY - 20) + "px";

    groupLabel.classList.remove("hidden");
    groupLabel.classList.add("visible");
}

function hideHoverLabel() {
    groupLabel.classList.remove("visible");
    groupLabel.classList.add("hidden");
}



/*
// sphere pour le placement des caméras
const sphere = new THREE.SphereGeometry(0.05, 32, 32);
const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const sphereMesh = new THREE.Mesh(sphere, red);
sphereMesh.position.set(0.05, 0.9, 0.85);
scene.add(sphereMesh);
*/
const Plight = new THREE.PointLight(0xffffff, 2, 25, 0);
const Plight2 = new THREE.PointLight(0xffffff, 1, 25, 0);
Plight.position.set(-1, 5, -1);
Plight2.position.set(0, 2, 0);
Plight.castShadow = true;
Plight.shadow.mapSize.width = 2048;
Plight.shadow.mapSize.height = 2048;
Plight.shadow.bias = -0.0005;
Plight.shadow.radius = 2;
if (Plight.shadow && Plight.shadow.camera) {
    Plight.shadow.camera.near = 0.5;
    Plight.shadow.camera.far = 300;
}
const Alight = new THREE.AmbientLight(0xffffff, 1);
scene.add( Alight,Plight,Plight2);

function loadGLTFModel(path, position = {x: 0, y: 0, z: 0}, scale = 1) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            path,
            (gltf) => {
                const model = gltf.scene;
                model.position.set(position.x, position.y, position.z);
                model.scale.set(scale, scale, scale);
                scene.add(model);
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve(model);
            },
            undefined,
            (error) => {
                console.error('Error loading GLTF model:', error);
                reject(error);
            }
        );
    });
}
// Load GLTF models
let mesh;

loadGLTFModel('./iso2.glb')
    .then((model) => {
        mesh = model;

        // Grouping rules
        const groupsMap = {
            moule: [], // names starting with 'moule_'
            house: [], // names containing 'house' (case-insensitive)
            ordi: [],  // 'ordi' (single object expected)
            golem: [], // golem de cuivre
        };

        // Collect candidate nodes (meshes or Object3D) and add to groups
        model.traverse((child) => {
            if (!child.name) return;
            const name = child.name;
            const lname = name.toLowerCase();

            // moule_: starts with
            if (name.startsWith('moule_')) {
                if (!groupsMap.moule.includes(child)) groupsMap.moule.push(child);
            }

            // house, OSB, Solid -> add to house group (case-insensitive)
            if (lname.includes('house') || lname.includes('osb') || lname.includes('solid')) {
                if (!groupsMap.house.includes(child)) groupsMap.house.push(child);
            }

            // ordi: exact or containing
            if (lname === 'ordi' || lname.includes('ordi')) {
                if (!groupsMap.ordi.includes(child)) groupsMap.ordi.push(child);
            }

            if (lname.includes('copper') || lname.includes('golem')) {
                if (!groupsMap.golem.includes(child)) groupsMap.golem.push(child);
            }

            
        });

        // Helper to create a group from a list of meshes
        function makeGroup(key, meshes) {
            if (!meshes || meshes.length === 0) return null;
            const grp = new THREE.Group();
            grp.name = key + '_group';
            grp.userData.isInteractiveGroup = true;
            grp.userData.clickable = true;
            grp.userData.originalScale = grp.scale.clone();
            // Add to scene and re-parent meshes while preserving world transform
            scene.add(grp);
            meshes.forEach((m) => {
                // if it's a mesh, ensure shadows and store original material
                if (m.isMesh) {
                    m.castShadow = true;
                    m.receiveShadow = true;
                    if (!m.userData.originalMaterial) m.userData.originalMaterial = m.material;
                }
                // preserve world transform when reparenting
                m.updateWorldMatrix(true, false);
                const worldMat = m.matrixWorld.clone();
                grp.add(m);
                // Log the object added to the group for visibility
                try {
                    console.log(`Added to ${grp.name}:`, m.name || '(unnamed)', m);
                } catch (e) {
                    // ignore logging errors
                }
                m.matrix.copy(worldMat);
                m.matrix.decompose(m.position, m.quaternion, m.scale);
                m.matrixAutoUpdate = true;
            });
            interactiveGroups.push(grp);
            return grp;
        }

        // Create groups as requested
        const created = [];
        created.push(makeGroup('moule', groupsMap.moule));
        created.push(makeGroup('house', groupsMap.house));
        created.push(makeGroup('ordi', groupsMap.ordi));
        created.push(makeGroup('golem', groupsMap.golem));

        const realCreated = created.filter(Boolean);
        if (realCreated.length === 0) {
            console.log("Aucun objet correspondant aux groupes demandés trouvé dans iso2.glb");
        } else {
            console.log('Groupes interactifs créés:', realCreated.map(g => g.name));
        }

        // Detailed listing: log each group's children (by name) for easy inspection
        realCreated.forEach((g) => {
            const members = [];
            g.traverse((c) => {
                if (c.isMesh) members.push(c.name || '(unnamed)');
            });
            console.log(`Group ${g.name} members (${members.length}):`, members);
        });

        // === Liste de tous les objets du modèle chargé ===
        const allObjects = [];
        model.traverse((c) => {
            allObjects.push({ name: c.name || '(unnamed)', type: c.type, uuid: c.uuid });
        });
        console.log('Liste complète des objets dans iso2.glb :', allObjects);

        // Expose une fonction globale pour lister tous les objets de la scène depuis la console
        window.listSceneObjects = function() {
            const list = [];
            scene.traverse((c) => {
                list.push({ name: c.name || '(unnamed)', type: c.type, uuid: c.uuid });
            });
            console.table(list);
            return list;
        };
    })
    .catch((error) => {
        console.error("Error loading ISS model:", error);
    });

// Set renderer size and pixel ratio
function resizeRenderer() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

// Initial size setup
resizeRenderer();

// Handle window resize
window.addEventListener('resize', resizeRenderer);

// Mouse events for interaction
window.addEventListener('mousemove', (event) => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (INTERSECTED_GROUP) {
        showHoverLabel(INTERSECTED_GROUP);
    }
});



// Helper function to smoothly move camera
function moveCamera(targetPosition, lookAtTarget, onComplete) {
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    cameraAnimationStartTime = Date.now();
    isMovingCamera = true;

    function updateCamera() {
        if (!isMovingCamera) return;

        const elapsed = Date.now() - cameraAnimationStartTime;
        const progress = Math.min(elapsed / CAMERA_ANIMATION_DURATION, 1);
        
        // Smooth easing
        const t = progress < .5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

        // Interpolate position and target
        camera.position.lerpVectors(startPosition, targetPosition, t);
        controls.target.lerpVectors(startTarget, lookAtTarget, t);
        controls.update();

        if (progress < 1) {
            requestAnimationFrame(updateCamera);
        } else {
            isMovingCamera = false;
            // call onComplete when available
            try { if (onComplete && typeof onComplete === 'function') onComplete(); } catch (e) { console.error('moveCamera onComplete error', e); }
        }
    }

    updateCamera();
}

// Helpers to animate meshes to new positions
function animateGroupMovement(group, targetPositionsMap, duration = 600, onComplete) {
    const startTime = Date.now();
    const starts = [];

    group.traverse((child) => {
        if (child.isMesh) {
            const startPos = child.position.clone();
            const target = targetPositionsMap[child.name];
            if (target) {
                starts.push({ mesh: child, startPos, target: new THREE.Vector3(target.x, target.y, target.z) });
                
            }
        }
    });

    function step() {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        starts.forEach((s) => {
            s.mesh.position.lerpVectors(s.startPos, s.target, ease);
        });

        if (t < 1) requestAnimationFrame(step);
        else if (onComplete) onComplete();
    }

    step();
}

// (computeDefaultExplodedPositions removed — exploding now requires explicit custom position maps)

// Store user-provided custom positions maps (can be set at runtime via console)
let houseCustomPositions = null;
let mouleCustomPositions = null;

// Default explode position maps — edit the per-object OFFSET values below to set custom positions
// The code below will populate `houseExplodePositionsMap` by adding these offsets to each object's current
// local position once the model is available. Offsets are applied in the group's local space.
// Format: houseOffsets = { "meshName": { x: dx, y: dy, z: dz }, ... }
const houseOffsets = {
    // Edit these offsets (relative) for each house mesh name listed here.
    // Positive values move the object along that axis from its current position.
    // Example names (replace with the exact mesh names from your model):
    "OSB": { x: 0.05, y: 0.02, z: 0.0 }, //facade arriere
    "Solid1": { x: 0.015, y: 0.02, z: 0.0 }, //structure arriere
    "Solid1001": { x: 0, y: 0.01, z: 0.0 }, //sol
    "OSB001": { x: -0.07, y: 0.02, z: 0.0 }, //facade avant
    "Solid1002": { x: -0.035, y: 0.02, z: 0.0 }, //structure avant
    "OSB002": { x: 0, y: 0.07, z: -0.05 }, //facade toit gauche
    "Solid1003": {  x: 0, y: 0.035, z: -0.05 }, //structure toit gauche
    "OSB003": {  x: 0, y: 0.07, z: 0.05 }, //facade toit droite
    "Solid1004": { x: 0, y: 0.035, z: 0.05}, //structure toit droite
    "OSB004": { x: -0, y: 0.02, z: 0.05 }, //facade cote droite
    "Solid1005": { x: 0, y: 0.02, z: 0.025 }, //structure cote droite
    "OSB005": { x: -0, y: 0.02, z: -0.05 }, //facade cote gauche
    "Solid1006": { x: 0, y: 0.02, z: -0.025 } //structure cote gauche
};

// The map that explodeGroupByName will consume. It will be populated automatically from offsets + current positions.
const houseExplodePositionsMap = {};

// Populate houseExplodePositionsMap once the model nodes are available in the scene.
(function populateHouseMap(retries = 0) { 
    const names = Object.keys(houseOffsets);
    let foundAny = false;

    names.forEach((name) => {
        const obj = scene.getObjectByName(name);
        if (obj && obj.isMesh) {
            foundAny = true;
            // use the mesh's local position (already parented to group) and add the relative offset
            const base = obj.position.clone();
            const off = houseOffsets[name] || { x: 0, y: 0, z: 0 };
            const target = base.add(new THREE.Vector3(off.x, off.y, off.z));
            houseExplodePositionsMap[name] = { x: target.x, y: target.y, z: target.z };
        }
    });

    // If none found yet and we haven't timed out, retry after a short delay (model may still be loading)
    if (!foundAny && retries < 40) {
        setTimeout(() => populateHouseMap(retries + 1), 200);
    } else if (!foundAny) {
        console.warn('populateHouseMap: did not find any house meshes by the configured names. Call listSceneObjects() to check names.');
    } else {
        console.log('houseExplodePositionsMap populated for:', Object.keys(houseExplodePositionsMap));
    }
})();

const mouleExplodePositionsMap = {
    "moule_piece1_" : {x:0.49, y:0.82, z:0.74  },
    "moule_piece2" : { x:0.55, y:0.57, z:0.75},
    "moule_piece3_" : { x:0.56, y:0.66, z:0.76 },
    "moule_Brick1stp-1" : { x:0.59, y:0.71, z:0.83 },

};



// Explode functions
function explodeGroupByName(groupName, customPositions) {
    const grp = interactiveGroups.find(g => g.name === groupName);
    if (!grp) return;

    // Ensure original positions are stored
    grp.traverse((child) => { if (child.isMesh && !child.userData.originalPosition) child.userData.originalPosition = child.position.clone(); });

    // Only use explicit custom positions — do not compute defaults here.
    if (!customPositions || Object.keys(customPositions).length === 0) {
        console.warn(`explodeGroupByName: no customPositions provided for ${groupName}; skipping explode.`);
        return;
    }

    const targets = customPositions;
    // animate movement
    animateGroupMovement(grp, targets, 600, () => { grp.userData.exploded = true; });
}

function explodeHouse() {
    const mapToUse = Object.keys(houseExplodePositionsMap).length ? houseExplodePositionsMap : (houseCustomPositions || null);
    explodeGroupByName('house_group', mapToUse);
}

function explodeMoule() {
    const mapToUse = Object.keys(mouleExplodePositionsMap).length ? mouleExplodePositionsMap : (mouleCustomPositions || null);
    explodeGroupByName('moule_group', mapToUse);
}

// Also expose explode functions to the console
window.explodeHouse = explodeHouse;
window.explodeMoule = explodeMoule;

window.addEventListener('click', (event) => {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveGroups, true);
    if (intersects.length === 0) return;
    const mesh = intersects[0].object;
    const grp = findInteractiveGroup(mesh);
    if (!grp) return;

    // If house or moule, trigger exploded view (store originals already handled in explode)
    if (grp.name === 'house_group') {
        explodeHouse();
    } else if (grp.name === 'moule_group') {
        explodeMoule();
    }

    // Move camera as before and show label
    const cameraSetup = groupCameraPositions[grp.name];
    if (cameraSetup) {
        moveCamera(cameraSetup.position, cameraSetup.target, () => {
            // After camera movement completes, read message from the DOM and show it
            const msg = getGroupMessage(grp.name);
            if (msg) showGroupMessage(msg);
            // Show the escape hint
            showEscapeHint();
        });
        console.log('Moving camera to view:', grp.name);
    }
});

// Reset camera view when user presses Escape
window.addEventListener('keydown', (event) => {
    // support 'Escape' and legacy 'Esc'
    if (event.key !== 'Escape' && event.key !== 'Esc') return;

    // Reset to default camera position
    moveCamera(new THREE.Vector3(-2, 2, -2), new THREE.Vector3(0, 0, 0));
    console.log('Reset camera view');

    // Restore exploded groups (house and moule) to their original positions if present
    function restoreGroupByName(groupName) {
        const grp = interactiveGroups.find(g => g.name === groupName);
        if (!grp) return;
        const targets = {};
        let hasOriginal = false;
        grp.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.originalPosition) {
                const p = child.userData.originalPosition;
                targets[child.name] = { x: p.x, y: p.y, z: p.z };
                hasOriginal = true;
            }
        });
        if (hasOriginal) {
            animateGroupMovement(grp, targets, 600, () => { grp.userData.exploded = false; });
        }
    }

    restoreGroupByName('house_group');
    restoreGroupByName('moule_group');

    // (label hidden) — label functions removed

    // Hide any visible group message
    hideGroupMessage();

    // Hide the escape hint
    hideEscapeHint();

    // Clear hover highlight if any
    if (INTERSECTED_GROUP) {
        setGroupHover(INTERSECTED_GROUP, false);
        INTERSECTED_GROUP = null;
    }
});

// Set scene background color (optional - remove the black background)
scene.background = new THREE.Color(0xffffff);  // White background

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    // Hover detection: cast against interactive groups
    if (interactiveGroups.length > 0) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interactiveGroups, true);
        if (intersects.length > 0) {
    const mesh = intersects[0].object;
    const grp = findInteractiveGroup(mesh);

    if (grp !== INTERSECTED_GROUP) {
        if (INTERSECTED_GROUP) setGroupHover(INTERSECTED_GROUP, false);

        INTERSECTED_GROUP = grp;

        if (INTERSECTED_GROUP) {
            setGroupHover(INTERSECTED_GROUP, true);
            showHoverLabel(INTERSECTED_GROUP);
        }
    }
} else {
    if (INTERSECTED_GROUP) {
        setGroupHover(INTERSECTED_GROUP, false);
        INTERSECTED_GROUP = null;
        hideHoverLabel();
    }
}

    }

    // label behavior removed

    controls.update();
    renderer.render(scene, camera);
}

animate();
