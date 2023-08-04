import {
    ClampToEdgeWrapping,
    LinearFilter,
    LinearMipmapLinearFilter,
    LinearMipmapNearestFilter,
    MirroredRepeatWrapping,
    NearestFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    RepeatWrapping,
    VideoTexture
  } from 'three';

const WEBGL_FILTERS = {
    9728: NearestFilter,
    9729: LinearFilter,
    9984: NearestMipmapNearestFilter,
    9985: LinearMipmapNearestFilter,
    9986: NearestMipmapLinearFilter,
    9987: LinearMipmapLinearFilter
  };
  
  const WEBGL_WRAPPINGS = {
    33071: ClampToEdgeWrapping,
    33648: MirroredRepeatWrapping,
    10497: RepeatWrapping
  };

/**
 *   MPEG_texture_video extension
 *   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_texture_video
 *         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_texture_video
 * 
 *   MPEG_texture_video extension provides the possibility to link a texture object 
 *   defined in glTF 2.0 to media and its respective track, listed by an MPEG_media
 */
export default class GLTFMPEGTextureVideoExtension {

    constructor( parser, gltf ) {
        this.name = 'MPEG_texture_video';
        this.parser = parser;
    }

    
    loadTexture( textureIndex ) {

        const parser = this.parser;
		    const json = parser.json;

        const textureDef = json.textures[ textureIndex ];

        if ( !textureDef.extensions || !textureDef.extensions[ this.name ] ) {
			    return null;
		    }

        // console.log( json );

        const extensionDef = textureDef.extensions[ this.name ];
        //console.log( extensionDef );
        
        const accessorIndex = extensionDef.accessor;
        const accessor = json.accessors[ accessorIndex ];
        const bufferViewIndex = accessor.bufferView;
        const bufferView = json.bufferViews[ bufferViewIndex ];
        const bufferIndex = bufferView.buffer;
        const buffer = json.buffers[ bufferIndex ];

        console.log( buffer.extensions.MPEG_buffer_circular.media );

        console.log( document );
        console.log( document.getElementById( "MPEG_media_0" ) );

        //console.log( json.bufferViews );

        // console.log( 'index:', textureIndex );
        // console.log( parser );
    }
    
    // // called once during parse by GLTFLoader
    // afterRoot( gltf ) {
    //     console.log( 'foo2' );
    // }
    
}

/**
 *   REFERENCE:
 *   https://threejs.org/docs/#api/en/textures/VideoTexture
 *   https://github.com/takahirox/three-gltf-extensions/blob/main/loaders/EXT_texture_video/EXT_texture_video.js
 */