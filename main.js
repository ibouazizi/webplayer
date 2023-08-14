import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import Stats from 'three/addons/libs/stats.module.js';

// module scoped  variables
let container, camera, scene, renderer, controls, stats;

await init();
animate();

// ****************************************************************
// init function. create container for three.js scene and 
//    init scene, camera, renderer, controls
async function init() {

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
    floor.position.y = -0.5;
    floor.rotation.x = Math.PI / 2.0;
    scene.add( floor );

    // ********** GLTF **********
    // load here
    // handle video textures, spatial audio


    // ********** STATS **********
    // add a stats module
    stats = new Stats();
    container.appendChild( stats.dom );

    // ********** WINDOW RESIZE **********
    // adjust camera when the window changes dimension
    window.addEventListener( 'resize', onWindowResize );

} // end init

// ****************************************************************
// animate function. 
// tell the browser we're ready to update the screen
function animate() {
  requestAnimationFrame( animate );
  render();
  update();
}

// ****************************************************************
// update function.
// update things that should be ticked every frame
function update() {
    // TODO: check for new data in buffers and update media
    controls.update();
    stats.update();
}

// ****************************************************************
// render function. use selected renderer to draw a frame
function render() { renderer.render( scene, camera ); }

// ****************************************************************
// window resize function.
// update camera and renderer when window changes
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.render( scene, camera );
}

/**
 *  REFERENCE:
 *  https://stemkoski.github.io/Three.js/Video.html
 *  https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
 */