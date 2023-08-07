import {
    AudioListener,
    PositionalAudio
  } from 'three';
import { PositionalAudioHelper } from 'three/addons/helpers/PositionalAudioHelper.js';

/**
*   MPEG_audio_spatial Extension
*   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_audio_spatial
*         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_audio_spatial
*
*   The MPEG_audio_spatial extension adds support for spatial audio and 
*   it may be included at top level or attached to any node in the scene.
*/
let listener; // use module scoped variable for listener?

export default class GLTFMPEGAudioSpatialExtension {
    constructor( parser ) {
        this.name = 'MPEG_audio_spatial';
        this.parser = parser;
    }

    // called during parse by gltfLoader
    loadNode( nodeIndex ) {
        const parser = this.parser;
        const json = parser.json;

        // skip if this extension is not present
        if( !json.nodes[ nodeIndex ].extensions ||
            !json.nodes[ nodeIndex ].extensions[ this.name ] ) {
            return null;
        }

        // TODO: ensure all of these are present / valid
        const sources = json.nodes[ nodeIndex ].extensions.MPEG_audio_spatial.sources;
        const accessorIndex = sources[0].accessors[0];
        const accessor = json.accessors[ accessorIndex ];
        const bufferViewIndex = accessor.bufferView;
        const bufferView = json.bufferViews[ bufferViewIndex ];
        const bufferIndex = bufferView.buffer;
        const buffer = json.buffers[ bufferIndex ];

        const mediaAccessString = 'MPEG_media_' + buffer.extensions.MPEG_buffer_circular.media;
        const importedAudio = document.getElementById( mediaAccessString );

        return new Promise( resolve => {

            // TODO: currently using module scoped 'listener'
            //  to point at audioListener
            // we can't just assume imported camera will be used.
            // append to .userData ?
            // we'll hack it here by appending to camera[0] from gltf scene
            // but will cameras always be parsed first? check this !!
            listener = new AudioListener();

            const positionalSound = new PositionalAudio( listener );
            // see also: setMediaStreamSource for webrtc audio streams
            positionalSound.setMediaElementSource( importedAudio );

            // populate properties from MPEG-I SD spec
            // i.e. referenceDistance
            const refDist = sources[0].referenceDistance;
            positionalSound.setRefDistance( refDist );

            const audioHelper = new PositionalAudioHelper( positionalSound, refDist );
            positionalSound.add( audioHelper );
            resolve( positionalSound );
        });
    }

    afterRoot( gltf ) {
        // TODO: handle this more cleaner
        gltf.cameras[0].add( listener );
    }
}

/**
 *   REFERENCE:
 *   https://threejs.org/docs/#api/en/audio/PositionalAudio
 */