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
    1003: NearestFilter,
    1006: LinearFilter,
    1004: NearestMipmapNearestFilter,
    1007: LinearMipmapNearestFilter,
    1005: NearestMipmapLinearFilter,
    1008: LinearMipmapLinearFilter
  };
  
  const WEBGL_WRAPPINGS = {
    1001: ClampToEdgeWrapping,
    1002: MirroredRepeatWrapping,
    1000: RepeatWrapping
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

        // TODO: validation that these are present
        const extensionDef = textureDef.extensions[ this.name ];
        const accessorIndex = extensionDef.accessor;
        const accessor = json.accessors[ accessorIndex ];
        const bufferViewIndex = accessor.bufferView;
        const bufferView = json.bufferViews[ bufferViewIndex ];
        const bufferIndex = bufferView.buffer;
        const buffer = json.buffers[ bufferIndex ];

        const mediaAccessString = 'MPEG_media_' + buffer.extensions.MPEG_buffer_circular.media;
        const video = document.getElementById( mediaAccessString );

        // sampler def for this texture
        const samplersDef = json.samplers || [];
        const samplerDef = samplersDef[textureDef.sampler] || {};

        return new Promise( resolve => {

            // TODO: play if not already playing?
            if( video.autoplay == false ) {
                console.log( "no autoplay" );
                video.play();
            }

            const texture = new VideoTexture( video );
            // set properties with sampler properties
            texture.magFilter = WEBGL_FILTERS[ samplerDef.magFilter ] || LinearFilter;
            texture.minFilter = WEBGL_FILTERS[ samplerDef.minFilter ] || LinearFilter;
            texture.wrapS = WEBGL_WRAPPINGS[ samplerDef.wrapS ] || RepeatWrapping;
            texture.wrapT = WEBGL_WRAPPINGS[ samplerDef.wrapT ] || RepeatWrapping;
            texture.flipY = false;
            resolve( texture );
        });
    }
}

/**
 *   REFERENCE:
 *   https://threejs.org/docs/#api/en/textures/VideoTexture
 *   https://github.com/takahirox/three-gltf-extensions/blob/main/loaders/EXT_texture_video/EXT_texture_video.js
 */