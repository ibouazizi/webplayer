import { RingBuffer } from "./third_party/ringbufjs/ringbuf.module.js";
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
    NoColorSpace,
    UnsignedByteType,
    DataTexture
  } from "three";

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

  const GL_COMPONENT_TYPES = {
	5120: Int8Array,
	5121: Uint8Array,
	5122: Int16Array,
	5123: Uint16Array,
	5125: Uint32Array,
	5126: Float32Array
};

/**
 *   MPEG_texture_video extension
 *   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_texture_video
 *         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_texture_video
 * 
 *   MPEG_texture_video extension provides the possibility to link a texture object 
 *   defined in glTF 2.0 to media given in the MPEG_media extension
 */
export class GLTFMPEGTextureVideoExtension {

    constructor( parser ) {
        this.name = 'MPEG_texture_video';
        this.parser = parser;
        this.updatables = [];
    }
    
    // loadTexture implementation for MPEG_texture_video.
    // instantiate a THREE texture object and a MP4VideoPipeline
    loadTexture( textureIndex ) {

        const parser = this.parser;
		const json = parser.json;

        const textureDef = json.textures[ textureIndex ];

        if ( !textureDef.extensions || !textureDef.extensions[ this.name ] ) {
			    return null;
		};

        // texture metadata
        const extensionDef = textureDef.extensions[ this.name ];
        const samplersDef = json.samplers || [];
        const samplerDef = samplersDef[textureDef.sampler] || {};

        // load dependencies and initialize texture
        return parser.getDependency( 'accessor', extensionDef.accessor ).then( accessor => {

            return new Promise( resolve => {
                const texture = new DataTexture( new GL_COMPONENT_TYPES[ accessor.properties.componentType ]( accessor.byteLength ),
                                            extensionDef.width,
                                            extensionDef.height,
                                        );
                            
                // THREE will use RGBA pixels by default

                // if pixels are RGB instead:
                if( extensionDef.format === 'RGB' ) {
                    texture.format = 'RGB';
                    texture.internalFormat = 'RGB8';
                    texture.type = UnsignedByteType;
                    texture.unpackAlignment = 1;
                    texture.colorSpace = NoColorSpace;
                }

                // TODO: handle the other pixel formats

                // size of a single frame in bytes
                texture.frameSize = accessor.byteLength;

                // parse texture settings
                texture.magFilter = WEBGL_FILTERS[ samplerDef.magFilter ] || LinearFilter;
                texture.minFilter = WEBGL_FILTERS[ samplerDef.minFilter ] || LinearFilter;
                texture.wrapS = WEBGL_WRAPPINGS[ samplerDef.wrapS ] || RepeatWrapping;
                texture.wrapT = WEBGL_WRAPPINGS[ samplerDef.wrapT ] || RepeatWrapping;
                texture.flipY = false;

                // attach buffer reference to texture
                texture.bufferCircular = new RingBuffer( accessor.buffer, 
                    GL_COMPONENT_TYPES[ accessor.properties.componentType ] );

                // allocate WebWorker and start pipeline
                // attach worker to texture so messages may be sent in the future (i.e. seeking)
                texture.worker = new Worker( './three-gltf-extensions/pipelines/video.js' );

                // retrieve index of the MPEG_media we want to fetch
                let bufferIdx = json.bufferViews[ accessor.properties.bufferView ].buffer;
                let mediaIdx = json.buffers[ bufferIdx ].extensions.MPEG_buffer_circular.media;

                // TODO: check alternatives for supported codecs
                // assuming a single entry for now
                let mediaDef =  parser.plugins.MPEG_media.metadata.media[ mediaIdx ].alternatives[0];

                // path template for use with MPEG_media uri
                let mediaPath = '../../' + parser.options.path;

                // send initialization meessage to worker. this is the
                // only message passing to be done between the threads
                // until playback controls are implemented
                texture.worker.postMessage({
                    command: 'initialize',
                    sab: texture.bufferCircular.buf,
                    uri: mediaPath + mediaDef.uri,
                    track: 0, // TODO: implement
                    type: accessor.properties.type,
                    componentType: accessor.properties.componentType,
                    width: extensionDef.width,
                    height: extensionDef.height,
                    options: {} // TODO: playback options, i.e. autoplay
                });

                // this extension will add an update() method to the texture 
                // similar to updateMatrix() and update() in other THREE.Textures
                // the animation thread will need to call this at the desired rate.
                // This is the same design as the controls, stats, animations, etc
                // MAYBE: could handle timing here?
                texture.update = async function() {
                    // update if there is >= 1 frame available in the buffer
                    if( this.bufferCircular.available_read() >= this.frameSize ) { 
                        await this.bufferCircular.pop( this.source.data.data );
                        // TODO: why does colorSpace property warn if not reset?
                        this.colorSpace = NoColorSpace;
                        this.needsUpdate = true;
                    }
                };
                // add this texture to list of updatable items
                this.updatables.push( texture );
                resolve( texture );
            });
        });
    }

    // pass marked textures to main function using result object
    afterRoot( result ) {

        // make sure there is a list of updatable objects
        if( !result.userData.MPEG_media ) {
            result.userData.MPEG_media = {};
        }

        if( !result.userData.MPEG_media.updatables ) {
            result.userData.MPEG_media.updatables = [];
        }
        
        // textures that need updating are marked at this point
        result.userData.MPEG_media.updatables = result.userData.MPEG_media.updatables.concat( this.updatables );
    }
}