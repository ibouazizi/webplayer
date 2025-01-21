import { RingBuffer } from "./third_party/ringbufjs/ringbuf.module.js";
import * as THREE from 'three';
import VideoWorker from './pipelines/video.js?worker';
import { bufferManager } from './utils/buffer_manager.js';

const WEBGL_FILTERS = {
    1003: THREE.NearestFilter,
    1006: THREE.LinearFilter,
    1004: THREE.NearestMipmapNearestFilter,
    1007: THREE.LinearMipmapNearestFilter,
    1005: THREE.NearestMipmapLinearFilter,
    1008: THREE.LinearMipmapLinearFilter
  };

  const WEBGL_WRAPPINGS = {
    1001: THREE.ClampToEdgeWrapping,
    1002: THREE.MirroredRepeatWrapping,
    1000: THREE.RepeatWrapping
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
        this.textures = new Map();
        this.sources = new Map();
        // Get renderer from parser's options
        this.renderer = parser.options.renderer;
    }
    
    // loadTexture implementation for MPEG_texture_video.
    // instantiate a THREE texture object and a MP4VideoPipeline
    loadTexture( textureIndex ) {

        const parser = this.parser;
        const json = parser.json;

        const textureDef = json.textures[ textureIndex ];
        const mpegExtension = textureDef.extensions?.[this.name];

        if ( !textureDef.extensions || !textureDef.extensions[ this.name ] ) {
            console.warn('No MPEG_texture_video extension found for texture:', textureIndex);
            return null;
        };

        // texture metadata
        const extensionDef = textureDef.extensions[ this.name ];
        const samplersDef = json.samplers || [];
        const samplerDef = samplersDef[textureDef.sampler] || {};

        // load dependencies and initialize texture
        return parser.getDependency( 'accessor', extensionDef.accessor ).then( accessor => {

            return new Promise( resolve => {
                // Calculate buffer size for RGBA format (4 bytes per pixel)
                const pixelCount = extensionDef.width * extensionDef.height;
                const bytesPerPixel = 4; // RGBA
                const bufferSize = pixelCount * bytesPerPixel;

                // Create shared buffer for video frames using buffer manager
                const bufferId = `video-${textureIndex}`;
                const maxFrames = 3; // Double buffering + 1 frame
                const circularBuffer = bufferManager.createBuffer(
                    bufferId,
                    extensionDef.width,
                    extensionDef.height,
                    4, // RGBA
                    maxFrames,
                    Uint8Array
                );

                // Create initial texture buffer
                const textureBuffer = new Uint8Array(bufferSize);
                
                // Create texture with RGBA format
                const texture = new THREE.DataTexture(
                    textureBuffer,
                    extensionDef.width,
                    extensionDef.height,
                    THREE.RGBAFormat,
                    THREE.UnsignedByteType
                );

                // Configure texture properties for sRGB
                texture.format = THREE.RGBAFormat;
                texture.type = THREE.UnsignedByteType;
                texture.colorSpace = THREE.SRGBColorSpace;

                // Store MPEG texture metadata
                texture.userData = {
                    sourceId: textureIndex,
                    mediaIndex: 0, // Since we only have one media item for now
                    width: extensionDef.width,
                    height: extensionDef.height,
                    format: extensionDef.format,
                    mpegTextureInfo: {
                        width: extensionDef.width,
                        height: extensionDef.height,
                        format: extensionDef.format,
                        accessor: extensionDef.accessor,
                        frameSize: extensionDef.width * extensionDef.height * 4 // RGBA = 4 bytes
                    }
                };

                 // Store texture in the map
                this.textures.set(textureIndex, texture);
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                texture.flipY = false;
                texture.needsUpdate = true;

                // Create and store video source
                const videoSource = {
                    circularBuffer: circularBuffer,
                    texture: texture,
                    width: extensionDef.width,
                    height: extensionDef.height,
                    format: extensionDef.format
                };
                this.sources.set(textureIndex, videoSource);

                // Store buffer and dimensions in userData
                texture.userData.width = extensionDef.width;
                texture.userData.height = extensionDef.height;
                texture.userData.frameSize = bufferSize;
                texture.bufferCircular = circularBuffer;

                // Store original dimensions for reference
                texture.userData.width = extensionDef.width;
                texture.userData.height = extensionDef.height;
                            
                // THREE will use RGBA pixels by default

                // Always use RGBA format for sRGB encoding compatibility
                // Just store the source format in userData if needed
                if( extensionDef.format === 'RGB' ) {
                    texture.userData.sourceFormat = 'RGB';
                }

                // TODO: handle the other pixel formats

                // size of a single frame in bytes
                texture.frameSize = accessor.byteLength;

                // parse texture settings
                texture.magFilter = WEBGL_FILTERS[ samplerDef.magFilter ] || THREE.LinearFilter;
                texture.minFilter = WEBGL_FILTERS[ samplerDef.minFilter ] || THREE.LinearFilter;
                texture.wrapS = WEBGL_WRAPPINGS[ samplerDef.wrapS ] || THREE.RepeatWrapping;
                texture.wrapT = WEBGL_WRAPPINGS[ samplerDef.wrapT ] || THREE.RepeatWrapping;
                texture.flipY = false;

                // attach buffer reference to texture
                // Use the already created buffer from buffer manager
                texture.bufferCircular = circularBuffer;
                
                // Register texture as a consumer
                bufferManager.registerConsumer(bufferId, texture);

                // allocate WebWorker and start pipeline
                // attach worker to texture so messages may be sent in the future (i.e. seeking)
                texture.worker = new VideoWorker();

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
                    textureIndex: textureIndex,
                    options: {} // TODO: playback options, i.e. autoplay
                });

                // this extension will add an update() method to the texture 
                // similar to updateMatrix() and update() in other THREE.Textures
                // the animation thread will need to call this at the desired rate.
                // This is the same design as the controls, stats, animations, etc
                // MAYBE: could handle timing here?
                texture.update = function() {
                    // update if there is >= 1 frame available in the buffer
                    const availableData = this.bufferCircular.available_read();
                    const count = this.bufferCircular.count || 0;
                    const capacity = this.bufferCircular.capacity;
                
                    if (availableData >= this.frameSize) {
                        try {
                            console.log('Reading frame data from ring buffer');
                            // Create a temporary buffer to hold the frame data
                            const frameData = new Uint8Array(this.frameSize);
                            const bytesRead = this.bufferCircular.pop(frameData);

                            
                            if (bytesRead === this.frameSize) {
                                // Copy frame data to texture buffer
                                this.image.data.set(frameData);
                                
                                // Ensure texture properties for sRGB
                                this.format = THREE.RGBAFormat;
                                this.type = THREE.UnsignedByteType;
                                this.colorSpace = THREE.SRGBColorSpace;
                                this.minFilter = THREE.LinearFilter;
                                this.magFilter = THREE.LinearFilter;
                                this.generateMipmaps = false;
                                this.flipY = false;
                                this.needsUpdate = true;


                                // Verify data format
                                const firstPixel = new Uint8Array(frameData.buffer, 0, 4);
 
                                // Mark texture for update
                                this.needsUpdate = true;
       
                            } else {
                                console.warn('Incomplete frame data:', bytesRead, 'bytes of', this.frameSize);
                            }
                        } catch (error) {
                            console.error('Error updating texture:', error);
                        }
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
        
        // Log all materials in the scene to check texture assignments
        result.scene.traverse(node => {
            if (node.material) {

                // If this material has a video texture, ensure proper setup
                if (node.material.map && node.material.map.update) {
                    
                    // Configure material for video texture
                    node.material.transparent = false;
                    node.material.needsUpdate = true;
                    
                    // Configure texture properties
                    const texture = node.material.map;
                    texture.colorSpace = 'srgb';
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.format = 'RGBA';
                    texture.type = THREE.UnsignedByteType;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.flipY = false;
                    texture.unpackAlignment = 1;
                    texture.needsUpdate = true;
                }
            }
      });
    }
}