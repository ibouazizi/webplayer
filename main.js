import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Stats from 'three/addons/libs/stats.module.js';
import { degToRad } from 'three/src/math/MathUtils';
import { RingBuffer } from "./third_party/ringbufjs/ringbuf.module.js";

const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING)
      return;
  console.debug(msg);
}

// module scoped  variables
let container, camera, scene, renderer, controls, stats;
let ringBuf;

let movieGeometry;
let worker;
let lastTimestep = 0;
const updateInterval = 1000 / 24;


// ****************************************************************
// load scene once start button is clicked.
// remove button from view.
const startScreen = document.getElementById( 'start-screen' );
startScreen.addEventListener( "click", async function () {
    startScreen.style.display = 'none';
    await init();
    start();
}, {once: true});


// handle incoming messages from web workers
function handleWorkerMessage( msg ) {
    switch ( msg.data.command ) {
      case "initialization-done":
        // create buffer object with reference to shared memory
        ringBuf = new RingBuffer( msg.data.sab, Uint8Array );

        // start the animation loop
        requestAnimationFrame( animate );
        break;

      default:
        console.error('recieved unexpected message from worker');
        break;
    }
}

async function init() {
  // initialize THREE scene and import gltf
  // ********** CONTAINER **********
  container = document.createElement( 'div' );
  container.id = 'threejs-canvas';
  document.body.appendChild( container );

  // ********** SCENE **********
  scene = new THREE.Scene();

  // ********** RENDERER **********
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // for HDR content i.e. envmap
  renderer.toneMappingExposure = 1;
  container.appendChild( renderer.domElement ); // add renderer to html container

  // ********** CAMERA **********
  // initialize a default camera
  camera = new THREE.PerspectiveCamera();
  camera.position.set( 0, 40, 40 );
  camera.lookAt(scene.position);

  // ********** CONTROLS **********
  // create a controls object that uses the default camera
  // TODO: set lookAt target?
  // can swap in controls from three/addons/controls/
  controls = new OrbitControls( camera, renderer.domElement );

  // ********** BACKGROUND **********
  // load an environment map from file
  const envLoader = new RGBELoader();
  envLoader.setPath( 'images/envmaps/' );
  const background = await envLoader.loadAsync( 'brown_photostudio_4k.hdr' );
  background.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = background;
  scene.environment = background;

  // ********** FLOOR **********
  const floorTex = await new THREE.TextureLoader().loadAsync( 'images/extras/oak-stretcher-715-in.jpg' );
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set( 2, 2 );
  const floorMat = new THREE.MeshStandardMaterial( { map: floorTex, side: THREE.DoubleSide } )
  const floorGeo = new THREE.PlaneGeometry( 100, 100, 10, 10 );
  const floor    = new THREE.Mesh( floorGeo, floorMat );
  floor.rotation.x = Math.PI / 2.0;
  scene.add( floor );

  // ********** GLTF CONTENT **********
  // load a gltf scene from file
  const modelLoader = new GLTFLoader();
  modelLoader.setPath( 'gltf/tv_model/' );
  const glTFData = await modelLoader.loadAsync( 'tv_model.gltf' );
  console.log( glTFData );
  glTFData.scene.scale.set( 20, 20, 20 );
  glTFData.scene.rotation.set( 0, degToRad(-90), 0 );
  scene.add( glTFData.scene );
  scene.updateMatrixWorld();  // recursively set world matrices ( needed for spatial audio )

  movieGeometry = scene.getObjectByName( 'Plane' );

  // TODO: do this during glTF parsing (MPEG_texture_video)
  // movieGeometry.material.map = new THREE.DataTexture( new Uint8Array( 3686400 ), 1280, 720, THREE.RGBAFormat);
  movieGeometry.material.map = new THREE.DataTexture( new Uint8Array( 2764800 ), 1280, 720 );
  movieGeometry.material.map.format = 'RGB';
  movieGeometry.material.map.internalFormat = 'RGB8';
  
  console.log( movieGeometry.material.map );
  
  // TODO: does this affect performance?
  // movieGeometry.material.map.unpackAlignment = 4;
                                                    
  debugLog( scene ); // print scene object for debugging

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
  function animate(timestep) {
    requestAnimationFrame( animate );
    update(timestep);
    render();
  }

  // ****************************************************************
  // update function.
  // update things that should be ticked every frame
  async function update(timestep) {
      
    controls.update();
    stats.update();

    const delta = timestep - lastTimestep;

    // check for new data in buffers and update media here
    // if there is >= 1 frame available in the buffer
    // TODO: use MPEG_buffer_circular to determine frame size
    // 2,764,800 = 3 * 1280 * 720
    if( ringBuf.available_read() >= 2764800 ) { 
      
      // update at suggested interval (24 fps here)
      if( delta >= updateInterval) {

        // pop from buffer into texture's underlying data array
        await ringBuf.pop( movieGeometry.material.map.source.data.data );
        movieGeometry.material.map.needsUpdate = true;  // mark new texture for upload
        lastTimestep = timestep;
      }

      // console.debug( "buffer health", ringBuf.available_read() / ringBuf.capacity() );
    }
    else {
      debugLog('buffer is empty');
    }

    // keep buffer healthy
    // TODO: implement time sync and frame dropping
    worker.postMessage({
      command: 'fill-buffer',
    });
}

  // ****************************************************************
  // render function. use selected renderer to draw a frame
  function render() { 
    renderer.render( scene, camera );
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

// Worker setup.
function start() {

  worker = new Worker("./pipelines/video.js");

  // send initialization meessage
  worker.postMessage({
    command: 'initialize',
  })

  // listen for a single initialization message then close
  worker.addEventListener("message", handleWorkerMessage, {once: true});
}