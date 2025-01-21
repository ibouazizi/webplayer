

// OpenCV.js is loaded via script tag in index.html

// Import THREE.js and extensions
import * as THREE from 'three';

// Verify THREE.js is loaded

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from './three-gltf-extensions/GLTFLoader.js'; // <-- note this modified from the THREE loader
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import Stats from 'three/addons/libs/stats.module.js';

//  extension imports
import { GLTFMPEGMediaExtension } from './three-gltf-extensions/EXT_MPEG_media.js';
import { GLTFMPEGBufferCircularExtension } from './three-gltf-extensions/EXT_MPEG_buffer_circular.js';
import { GLTFMPEGAccessorTimedExtension } from './three-gltf-extensions/EXT_MPEG_accessor_timed.js';
import { GLTFMPEGTextureVideoExtension } from './three-gltf-extensions/EXT_MPEG_texture_video.js';
import { GLTFMPEGAudioSpatialExtension } from './three-gltf-extensions/EXT_MPEG_audio_spatial.js';

const ENABLE_DEBUG_LOGGING = true;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING)
      return;
  console.debug(msg);
}

// module scoped variables
let container, camera, scene, renderer, controls, stats;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let raycaster;
let updatableMedia = [];
let lastTimestep = 0;
let audioExtension = null;
const updateInterval = 1000 / 20;

function onSelectStart() {
    this.userData.isSelecting = true;
}

function onSelectEnd() {
    this.userData.isSelecting = false;
}

function handleController(controller) {
    if (controller.userData.isSelecting) {
        // Handle controller selection/interaction
        // You can add specific VR interactions here
        const controllerMatrix = controller.matrixWorld;
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controllerMatrix);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(controllerMatrix));

        // Check for intersections with interactive objects
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            // Handle intersection - e.g., play/pause video, move objects, etc.
            const object = intersects[0].object;
            if (object.userData.clickable) {
                object.userData.onClick();
            }
        }
    }
}

function buildController(data) {
    let geometry, material;

    switch (data.targetRayMode) {
        case 'tracked-pointer':
            // Tracked controller - show a pointer
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
            material = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5
            });
            return new THREE.Line(geometry, material);

        case 'gaze':
            // Gaze-based controller (e.g., Cardboard) - show a reticle
            geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
            material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                opacity: 0.5,
                transparent: true
            });
            return new THREE.Mesh(geometry, material);
    }
}


// ****************************************************************
// Initialize scene when OpenCV and the page are loaded
window.addEventListener('load', async () => {
    try {
        // Wait for OpenCV to be ready
        await window.opencvReady;
        
        // Make sure cv is actually available
        if (!window.cv) {
            throw new Error('OpenCV.js failed to initialize properly');
        }
        
        // Initialize the scene
        await init();
        requestAnimationFrame(animate);
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
});

function checkWebGLSupport() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
            throw new Error('WebGL not supported');
        }

        return true;
    } catch (error) {
        console.error('WebGL check failed:', error);
        return false;
    }
}

async function init() {
    
    // Check WebGL support
    if (!checkWebGLSupport()) {
        throw new Error('WebGL not supported');
    }
  // initialize THREE scene and import gltf
  // ********** CONTAINER **********
  container = document.createElement('div');
  container.id = 'threejs-canvas';
  document.body.appendChild(container);
  
  // Create play button overlay and button
  const playOverlay = document.createElement('div');
  playOverlay.className = 'play-overlay';
  
  const playButton = document.createElement('button');
  playButton.textContent = '▶ Play Video';
  playButton.className = 'play-button';
  
  playButton.onclick = async () => {
    // Add fade out animation
    playOverlay.style.opacity = '0';
    
    // Start all media pipelines
    for (const updatable of updatableMedia) {
      if (updatable.play) {
        try {
          await updatable.play();
        } catch (error) {
          console.error('Error starting playback:', error);
        }
      }
    }
    
    // Remove overlay after animation
    setTimeout(() => {
      playOverlay.remove();
    }, 500); // Match this with CSS transition duration
  };
  
  playOverlay.appendChild(playButton);
  document.body.appendChild(playOverlay);

  // ********** SCENE **********
  scene = new THREE.Scene();

  // ********** RENDERER **********
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    
    // Check if WebGL is available
    if (!renderer.capabilities.isWebGL2) {
      console.warn('WebGL 2 not available, using WebGL 1');
    }
    
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.xr.enabled = true;



    container.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));
  } catch (error) {
    console.error('Error setting up renderer:', error);
    console.error('Stack trace:', error.stack);
  }

  // ********** CAMERA **********
  // initialize a default camera in case one is not provided
  camera = new THREE.PerspectiveCamera();

  // ********** CONTROLS **********
  // create a controls object that uses the default camera
  // can swap in other controls from three/addons/controls/
  controls = new OrbitControls( camera, renderer.domElement );

  // ********** VR CONTROLLERS **********
  // Setup VR controllers
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  controller1.addEventListener('connected', function(event) {
    this.add(buildController(event.data));
  });
  controller1.addEventListener('disconnected', function() {
    this.remove(this.children[0]);
  });
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  controller2.addEventListener('connected', function(event) {
    this.add(buildController(event.data));
  });
  controller2.addEventListener('disconnected', function() {
    this.remove(this.children[0]);
  });
  scene.add(controller2);

  // Controller grips
  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  // Raycaster for controller interaction
  raycaster = new THREE.Raycaster();

  // ********** BACKGROUND **********
  // load an environment map from file
  const envLoader = new RGBELoader();
  envLoader.setPath( 'images/envmaps/' );
  // const background = await envLoader.loadAsync( 'royal_esplanade_1k.hdr' );
  const background = await envLoader.loadAsync( 'brown_photostudio_4k.hdr' );
  background.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = background;
  scene.environment = background;

  // ********** GLTF CONTENT **********
  // initialize a GLTFLoader object with renderer
  const modelLoader = new GLTFLoader();
  modelLoader.options = { 
    renderer,
    // Set default texture encoding for the scene
    textureEncoding: THREE.sRGBEncoding
  };

  // register MPEG-I SD extensions
  let audioExtension;
  
  modelLoader.register(parser => {
    const ext = new GLTFMPEGMediaExtension(parser);
    return ext;
  });

  modelLoader.register(parser => {
    const ext = new GLTFMPEGBufferCircularExtension(parser);
    return ext;
  });

  modelLoader.register(parser => {
    const ext = new GLTFMPEGAccessorTimedExtension(parser);
    return ext;
  });

  modelLoader.register(parser => {
    const ext = new GLTFMPEGTextureVideoExtension(parser);
    return ext;
  });

  modelLoader.register(parser => {
    try {
      audioExtension = new GLTFMPEGAudioSpatialExtension(parser);
      return audioExtension;
    } catch (error) {
      console.error('Failed to create GLTFMPEGAudioSpatialExtension:', error);
      audioExtension = null;
      return null;
    }
  });

  modelLoader.setPath('gltf/theater/');
  
  let glTFData;
  try {
    glTFData = await modelLoader.loadAsync('theater.gltf');
    
    // Log scene graph
    glTFData.scene.traverse(node => {

    });
  } catch (error) {
    console.error('Error loading GLTF:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }

  // Log detailed information about the loaded model
  console.log('GLTF loaded:', {
    scenes: glTFData.scenes,
    cameras: glTFData.cameras,
    animations: glTFData.animations,
    extensions: glTFData.parser.json.extensions,
    extensionsUsed: glTFData.parser.json.extensionsUsed,
    materials: glTFData.parser.json.materials
  });

  // add glTF to THREE scene
  scene.add( glTFData.scene );

  // recursively set world matrices ( needed for spatial audio )
  scene.updateMatrixWorld();

  // Handle camera setup from glTF
  try {
    if (glTFData.cameras && glTFData.cameras.length > 0) {
      // Use the first camera from glTF
      const gltfCamera = glTFData.cameras[0];
      
      // Find the node that contains this camera to get its transform
      let cameraNode = null;
      glTFData.scene.traverse((node) => {
        if (node.isCamera && node.uuid === gltfCamera.uuid) {
          cameraNode = node;
        }
      });

      if (cameraNode) {
        // Get the world transform of the camera
        const worldMatrix = new THREE.Matrix4();
        cameraNode.updateMatrixWorld(true);
        worldMatrix.copy(cameraNode.matrixWorld);

        // Extract position and rotation
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        worldMatrix.decompose(position, quaternion, scale);

        // Get the camera's forward direction
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(quaternion);

        // Calculate target point some distance along forward vector
        const targetDistance = 10;
        const target = new THREE.Vector3();
        target.copy(position).add(forward.multiplyScalar(targetDistance));

        // Apply camera properties
        camera = gltfCamera;
        camera.position.copy(position);
        controls.target.copy(target);
        
        // Break camera out of glTF scene graph but maintain its transform
        camera.parent = null;
        camera.matrix.copy(worldMatrix);
        camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
        
        // Set up controls
        controls.object = camera;
        
        // Update camera aspect ratio
        onWindowResize();

        console.log('Using glTF camera:', {
          position: camera.position.toArray(),
          target: controls.target.toArray(),
          fov: camera.fov,
          aspect: camera.aspect,
          near: camera.near,
          far: camera.far
        });
      } else {
        console.warn('Camera node not found in scene graph, using default camera');
        setupDefaultCamera();
      }
    } else {
      console.warn('No cameras found in glTF, using default camera');
      setupDefaultCamera();
    }
  } catch (error) {
    console.error('Error setting up camera:', error);
    console.error('Stack trace:', error.stack);
    setupDefaultCamera();
  }

  function setupDefaultCamera() {
    // Default camera setup as fallback
    camera.position.set(1.66, 1.2, 0.2);
    const tvMesh = scene.getObjectByName('TV_screen');
    if (!tvMesh) {
      controls.target.set(0, 0, 0);
    } else {
      const tvBBox = new THREE.Box3();
      tvBBox.setFromObject(tvMesh);
      controls.target = tvBBox.getCenter(new THREE.Vector3());
    }
  }

  // retrieve media pointers and add to update list
  updatableMedia.push(...glTFData.userData.MPEG_media.updatables);
  
  // Set up DASH streaming for media items
  if (glTFData.parser.json.extensions?.MPEG_media?.media) {
    const mediaExtension = glTFData.parser.plugins.MPEG_media;
    
    // Create pipelines for each media item
    for (let i = 0; i < glTFData.parser.json.extensions.MPEG_media.media.length; i++) {
      try {
        const pipeline = await mediaExtension.createPipeline(i);
        
        // Connect pipeline to video textures
        scene.traverse(async (node) => {
          if (node.material && node.material.map) {
            const texture = node.material.map;

            if (texture.userData.mediaIndex === i) {
              pipeline.connectVideoTexture(glTFData.parser.plugins.MPEG_texture_video, texture.userData.sourceId);
            }
          }
        });

        // Connect pipeline to audio sources
        if (audioExtension) {
          scene.traverse(async (node) => {
 
            if (node.userData.audioSourceId !== undefined && node.userData.mediaIndex === i) {
              pipeline.connectAudioSource(audioExtension, node.userData.audioSourceId);
            }
          });
        }

        // Start playback
        pipeline.play();
      } catch (error) {
        console.error(`Error setting up pipeline for media ${i}:`, error);
        console.error('Error details:', {
          stack: error.stack,
          message: error.message
        });
      }
    }
  } else {
    console.warn('No MPEG_media extension found in the glTF file');
  }
  
  // print scene object 
  debugLog( scene );

  // ********** STATS **********
  // add a stats module
  stats = new Stats();
  container.appendChild( stats.dom );

  // ********** WINDOW RESIZE **********
  // adjust camera when the window changes dimension
  window.addEventListener( 'resize', onWindowResize );
}

  // ****************************************************************
  // animate function. 
  // tell the browser we're ready to update the screen
  function animate( timestep ) {
    renderer.setAnimationLoop(render);
  }

  // ****************************************************************
  // update function.
  // update things that need to be ticked here
  async function update( timestep ) {
    controls.update();
    stats.update();

    const delta = timestep - lastTimestep;

    // update at a suggested interval
    if( delta >= updateInterval) {
      for( let i = 0; i < updatableMedia.length; i++ ) {
        try {
          updatableMedia[i].update();
        } catch (error) {
          console.error(`Error updating media ${i}:`, error);
        }
      }

      // Update spatial audio
      if (audioExtension && typeof audioExtension.update === 'function') {
        try {
          audioExtension.update(scene, camera);
          debugLog('Audio updated');
        } catch (error) {
          console.error('Error updating audio:', error);
          // If we get a critical error, disable the audio extension
          if (error instanceof TypeError || error.message.includes('undefined')) {
            console.warn('Disabling audio extension due to critical error');
            audioExtension = null;
          }
        }
      }

      lastTimestep = timestep;
    }

    // Update VR controllers
    if (controller1) handleController(controller1);
    if (controller2) handleController(controller2);
}

  // ****************************************************************
  // render function. use selected renderer to draw a frame
  function render(time) { 
    update(time);
    renderer.render(scene, camera);
  }
  
  // ****************************************************************
  // window resize function.
  // update camera and renderer when window changes
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.render( scene, camera );
  }