import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from './three-gltf-extensions/GLTFLoader.js'; // <-- note this modified from the THREE loader
import Stats from 'three/addons/libs/stats.module.js';

//  extension imports
import { GLTFMPEGMediaExtension } from './three-gltf-extensions/EXT_MPEG_media.js';
import { GLTFMPEGBufferCircularExtension } from './three-gltf-extensions/EXT_MPEG_buffer_circular.js';
import { GLTFMPEGAccessorTimedExtension } from './three-gltf-extensions/EXT_MPEG_accessor_timed.js';
import { GLTFMPEGTextureVideoExtension } from './three-gltf-extensions/EXT_MPEG_texture_video.js';

const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING)
      return;
  console.debug(msg);
}

// module scoped variables
let container, camera, scene, renderer, controls, stats;
let updatableMedia = [];
let lastTimestep = 0;
const updateInterval = 1000 / 20;


// ****************************************************************
// load scene once start button is clicked.
// remove button from view.
const startScreen = document.getElementById( 'start-screen' );
startScreen.addEventListener( "click", async function () {
    startScreen.style.display = 'none';
    await init();
    requestAnimationFrame( animate );
}, {once: true});

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
  // initialize a default camera in case one is not provided
  camera = new THREE.PerspectiveCamera();

  // ********** CONTROLS **********
  // create a controls object that uses the default camera
  // can swap in other controls from three/addons/controls/
  controls = new OrbitControls( camera, renderer.domElement );

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
  // initialize a GLTFLoader object
  const modelLoader = new GLTFLoader();

  // register MPEG-I SD extensions
  modelLoader.register( parser => new GLTFMPEGMediaExtension( parser )); 
  modelLoader.register( parser => new GLTFMPEGBufferCircularExtension( parser ));
  modelLoader.register( parser => new GLTFMPEGAccessorTimedExtension( parser ));
  modelLoader.register( parser => new GLTFMPEGTextureVideoExtension( parser ));

  modelLoader.setPath( 'gltf/test_scene/' );
  const glTFData = await modelLoader.loadAsync( 'scene.360p48k.gltf' );

  // print 'result' object 
  debugLog( glTFData );

  // add glTF to THREE scene
  scene.add( glTFData.scene );

  // recursively set world matrices ( needed for spatial audio )
  scene.updateMatrixWorld();

  // if glTF provided a camera(s), use it for rendering and controls
  // TODO: some way to cycle through if there are > 1
  if( glTFData.cameras.length > 0 ) {
    camera = glTFData.cameras[0];
    camera.parent = null;        // break camera out of glTF node graph
    controls.object = camera;    // use current controller for this camera
    onWindowResize();    
  }

  // move camera ( this stuff should be changed in gltf instead )
  // point camera at TV
  camera.position.set( 1.66, 1.2, 0.2 );
  const tvMesh = scene.getObjectByName( 'TV_screen' );
  const tvBBox = new THREE.Box3();
  tvBBox.setFromObject( tvMesh );
  controls.target = tvBBox.getCenter( new THREE.Vector3() );

  // retrieve media pointers and add to update list
  updatableMedia.push(...glTFData.userData.MPEG_media.updatables );
  
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
    requestAnimationFrame( animate );
    update( timestep );
    render();
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
        updatableMedia[i].update();
      }

      lastTimestep = timestep;
    }
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