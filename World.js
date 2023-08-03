import * as THREE from 'three';
import { Loop } from "./Loop.js";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
//import { PositionalAudioHelper } from 'three/addons/helpers/PositionalAudioHelper.js';
import GLTFMPEGMediaExtension from './three-gltf-extensions/EXT_MPEG_media.js';
import GLTFMPEGTextureVideoExtension from './three-gltf-extensions/EXT_MPEG_texture_video.js';
import Stats  from 'three/addons/libs/stats.module.js';

// module scoped
let camera, scene, renderer, loop, controls;

class World {

    // ****************************************************************
    // constructor defines the scene, camera, renderer,
    //      controls, animation loop, and stats module
    // adds event listeners for window resize and keyboard input
    constructor( container ) {

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
        // initialize a default camera for fallback if 
        // glTF does not provide one
        camera = new THREE.PerspectiveCamera();
        camera.position.set( 0, 10, -10 );

        // ********** CONTROLS **********
        // create a controls object that uses default camera
        // need to update if glTF provides camera
        // TODO: set lookAt target?
        // can swap in controls from three/addons/controls/
        controls = new OrbitControls( camera, renderer.domElement );

        // ********** LOOP **********
        // create an animation loop
        loop = new Loop( camera, scene, renderer );

        // ********** STATS **********
        // add a stats module
        const stats = new Stats();
        container.appendChild( stats.dom );

        // patch a tick property to stats object
        stats.tick = () => { stats.update() };

        // add stats to animation loop update list
        loop.updatables.push( stats );
        
        // ********** WINDOW RESIZE **********
        // adjust camera when the window changes dimension
        window.addEventListener( 'resize', this.onWindowResize );

        // ********** KEYBOARD INPUT **********
        // add listener for keydown events
        document.addEventListener( 'keydown', this.onKeyDown );

    }

    // ****************************************************************
    // init defines the contents of the scene.
    // complete any asynchrouous tasks i.e. loaders 
    async init() {

        // ********** BACKGROUND **********
        // load an environment map from file
        const envLoader = new RGBELoader();
        envLoader.setPath( 'images/envmaps/' );
        const background = await envLoader.loadAsync( 'brown_photostudio_4k.hdr' );
        background.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = background;
        scene.environment = background;


        // ********** GLTF CONTENT **********
        // load a gltf scene from file
        const gltfLoader = new GLTFLoader();
        gltfLoader.setPath( 'gltf/livingRoomEXT/video/' );
        gltfLoader.register( parser => new GLTFMPEGMediaExtension( parser )); // register MPEG_media extention
        gltfLoader.register( parser => new GLTFMPEGTextureVideoExtension( parser )); // register MPEG_texture_video extension
        const glTFData = await gltfLoader.loadAsync( 'scene.360p48k.gltf' );
        // const glTFData = await gltfLoader.loadAsync( 'test.gltf' );

        console.log( glTFData );

        // if glTF provided a camera(s), use it for rendering and controls
        // TODO: some way to cycle through if there are > 1 ?
        if( glTFData.cameras.length > 0 ) {
            this.updateWorldCamera( glTFData.cameras[0] );
        }

        // add the full gltf scene to THREE scene
        scene.add( glTFData.scene );
        scene.updateMatrixWorld();  // !! manually update world matrices !!


        // ********** GRID HELPER **********
        //  draw a simple grid to help with debugging
        const size = 50;
        const divisions = 10;
        scene.add( new THREE.GridHelper( size, divisions ) );

    } // end init


    // ****************************************************************
    // World's methods:

    // begin animation loop
    start() {
        loop.start();
    }

    // stop animation loop
    stop() {
        loop.stop();
    }

    // update camera and renderer when window changes
    onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );
        renderer.render( scene, camera );
    }

    // update current camera parameters with another camera
    updateWorldCamera( newCamera ) {
        // copy children to new camera (i.e. audioListener)
        let children = camera.children;
        camera = newCamera;
        camera.parent = null;        // break camera out of node graph
        camera.children = children;  
        loop.camera = camera;        // update loop camera
        controls.object = camera;    // use current controller for this camera
        this.onWindowResize();
    }


    // define behavior when keys are pressed
    onKeyDown( event ) {
        switch ( event.code ) {

            // print stuff to console when P is pressed
            case 'KeyP':
                console.log( scene );
                // console.log( controls );
                // console.log( camera );
                break;

        }
    }
}

export { World };