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
    DataTexture,
    RGBAFormat,
    SRGBColorSpace,
    RedFormat,
    RGFormat,
    DoubleSide,
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    PlaneGeometry,
    MeshBasicMaterial,
    Mesh,
    OrthographicCamera
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
 * MPEG_texture_video extension
 * spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_texture_video
 *       https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_texture_video
 * 
 * MPEG_texture_video extension provides the possibility to link a texture object 
 * defined in glTF 2.0 to media given in the MPEG_media extension
 */
export class GLTFMPEGTextureVideoExtension {
    constructor(parser) {
        this.name = 'MPEG_texture_video';
        this.parser = parser;
        this.updatables = [];
        // Get renderer from parser's options
        this.renderer = parser.options.renderer;

        // Create debug renderer
        this.setupDebugRenderer();
    }

    setupDebugRenderer() {
        // Create debug scene
        this.debugScene = new Scene();
        
        // Create debug camera (orthographic for 2D view)
        this.debugCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.debugCamera.position.z = 5;

        // Create debug renderer
        this.debugRenderer = new WebGLRenderer({ 
            antialias: true,
            alpha: false // Disable transparency for debugging
        });
        this.debugRenderer.setClearColor(0x444444, 1); // Gray background
        this.debugRenderer.setPixelRatio(window.devicePixelRatio);
        this.debugRenderer.setSize(640, 360); // Larger debug view
        
        // Position the debug view
        this.debugRenderer.domElement.style.position = 'fixed';
        this.debugRenderer.domElement.style.bottom = '10px';
        this.debugRenderer.domElement.style.right = '10px';
        this.debugRenderer.domElement.style.border = '1px solid white';
        this.debugRenderer.domElement.style.zIndex = '1000';
        
        // Add to document
        document.body.appendChild(this.debugRenderer.domElement);

        // Create debug plane
        console.log('Creating debug plane...');
        const geometry = new PlaneGeometry(2, 2); // Fill the view
        
        // Create initial debug texture
        const debugTexture = new DataTexture(
            new Uint8Array([255, 0, 0, 255]), // Single red pixel
            1, 1, // 1x1 texture
            RGBAFormat,
            UnsignedByteType
        );
        debugTexture.needsUpdate = true;
        
        const material = new MeshBasicMaterial({ 
            side: DoubleSide,
            transparent: false,
            map: debugTexture // Use texture instead of color
        });
        
        this.debugPlane = new Mesh(geometry, material);
        this.debugScene.add(this.debugPlane);
        
        console.log('Debug plane created:', {
            geometryValid: !!this.debugPlane.geometry,
            materialValid: !!this.debugPlane.material,
            textureValid: !!this.debugPlane.material.map,
            inScene: this.debugScene.children.includes(this.debugPlane)
        });
        
        // Position camera to see the full plane
        this.debugCamera.position.z = 1;
        
        console.log('Debug plane created:', {
            geometryValid: !!this.debugPlane.geometry,
            materialValid: !!this.debugPlane.material,
            inScene: this.debugScene.children.includes(this.debugPlane)
        });

        // Start render loop
        const animate = () => {
            requestAnimationFrame(animate);
            if (this.debugRenderer && this.debugScene && this.debugCamera) {
                this.debugRenderer.render(this.debugScene, this.debugCamera);
            }
        };
        animate();
    }
    
    // loadTexture implementation for MPEG_texture_video.
    // instantiate a THREE texture object and a MP4VideoPipeline
    loadTexture(textureIndex) {
        console.log('Loading video texture:', textureIndex);

        const parser = this.parser;
        const json = parser.json;

        const textureDef = json.textures[textureIndex];
        console.log('Texture definition:', textureDef);

        if (!textureDef.extensions || !textureDef.extensions[this.name]) {
            console.warn('No MPEG_texture_video extension found for texture:', textureIndex);
            return null;
        }

        // texture metadata
        const extensionDef = textureDef.extensions[this.name];
        const samplersDef = json.samplers || [];
        const samplerDef = samplersDef[textureDef.sampler] || {};

        // load dependencies and initialize texture
        return parser.getDependency('accessor', extensionDef.accessor).then(accessor => {
            return new Promise(resolve => {
                console.log('Creating texture with dimensions:', extensionDef.width, 'x', extensionDef.height);
                console.log('Component type:', accessor.properties.componentType);
                console.log('Byte length:', accessor.byteLength);

                // Calculate buffer size for RGBA format (4 bytes per pixel)
                const pixelCount = extensionDef.width * extensionDef.height;
                const bytesPerPixel = 4; // RGBA
                const bufferSize = pixelCount * bytesPerPixel;

                // Create shared buffer for video frames with extra capacity for safety
                const sab = RingBuffer.getStorageForCapacity(bufferSize * 4, Uint8Array);
                const circularBuffer = new RingBuffer(sab, Uint8Array);

                // Create initial texture buffer and fill with black pixels
                const textureBuffer = new Uint8Array(bufferSize);
                for (let i = 0; i < bufferSize; i += 4) {
                    textureBuffer[i] = 0;     // R
                    textureBuffer[i+1] = 0;   // G
                    textureBuffer[i+2] = 0;   // B
                    textureBuffer[i+3] = 255; // A
                }

                // Create texture with RGBA format
                const texture = new DataTexture(
                    textureBuffer,
                    extensionDef.width,
                    extensionDef.height,
                    RGBAFormat,
                    UnsignedByteType
                );

                // Configure texture properties
                texture.colorSpace = SRGBColorSpace;
                texture.minFilter = LinearFilter;
                texture.magFilter = LinearFilter;
                texture.generateMipmaps = false;
                texture.flipY = false;
                texture.needsUpdate = true;

                // Store buffer info in texture userData for debugging
                texture.userData.bufferInfo = {
                    capacity: circularBuffer.capacity(),
                    frameSize: bufferSize,
                    type: 'Uint8Array'
                };

                console.log('[Buffer] Created with:', {
                    capacity: circularBuffer.capacity(),
                    availableWrite: circularBuffer.available_write(),
                    type: 'Uint8Array',
                    frameSize: bufferSize,
                    sab: sab.byteLength
                });

                console.log('Created texture:', {
                    width: extensionDef.width,
                    height: extensionDef.height,
                    format: texture.format,
                    type: texture.type,
                    colorSpace: texture.colorSpace,
                    bufferSize: bufferSize
                });

                console.log('Initial texture configuration:', {
                    format: texture.format,
                    type: texture.type,
                    colorSpace: texture.colorSpace,
                    width: extensionDef.width,
                    height: extensionDef.height,
                    dataLength: bufferSize
                });

                // Store original dimensions for reference
                texture.userData.width = extensionDef.width;
                texture.userData.height = extensionDef.height;
                
                // THREE will use RGBA pixels by default
                // Just store the source format in userData if needed
                if (extensionDef.format === 'RGB') {
                    texture.userData.sourceFormat = 'RGB';
                }

                // size of a single frame in bytes
                texture.frameSize = accessor.byteLength;

                // parse texture settings
                texture.magFilter = WEBGL_FILTERS[samplerDef.magFilter] || LinearFilter;
                texture.minFilter = WEBGL_FILTERS[samplerDef.minFilter] || LinearFilter;
                texture.wrapS = WEBGL_WRAPPINGS[samplerDef.wrapS] || RepeatWrapping;
                texture.wrapT = WEBGL_WRAPPINGS[samplerDef.wrapT] || RepeatWrapping;
                texture.flipY = false;

                // attach buffer reference to texture
                texture.bufferCircular = circularBuffer;

                // allocate WebWorker and start pipeline
                // attach worker to texture so messages may be sent in the future (i.e. seeking)
                texture.worker = new Worker('./three-gltf-extensions/pipelines/video.js');

                // retrieve index of the MPEG_media we want to fetch
                let bufferIdx = json.bufferViews[accessor.properties.bufferView].buffer;
                let mediaIdx = json.buffers[bufferIdx].extensions.MPEG_buffer_circular.media;

                // TODO: check alternatives for supported codecs
                // assuming a single entry for now
                let mediaDef = parser.plugins.MPEG_media.metadata.media[mediaIdx].alternatives[0];

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
                texture.update = function() {
                    const availableData = this.bufferCircular.available_read();
                    
                    console.log('[Buffer] Pre-pop status:', {
                        available: availableData,
                        frameSize: this.frameSize,
                        capacity: this.bufferCircular.capacity(),
                        bufferInfo: this.userData.bufferInfo
                    });
                    
                    if (availableData >= this.frameSize) {
                        // Create buffer for frame data
                        const frameData = new Uint8Array(this.frameSize);
                        let totalRead = 0;
                        
                        try {
                            // Read data in chunks
                            const chunkSize = 16384; // 16KB chunks
                            
                            while (totalRead < this.frameSize) {
                                const remaining = this.frameSize - totalRead;
                                const toRead = Math.min(remaining, chunkSize);
                                const chunk = new Uint8Array(toRead);
                                
                                const bytesRead = this.bufferCircular.pop(chunk);
                                if (bytesRead <= 0) break;
                                
                                frameData.set(chunk, totalRead);
                                totalRead += bytesRead;
                            }
                            
                            console.log('[Buffer] Read complete:', {
                                totalRead,
                                frameSize: this.frameSize,
                                firstPixel: Array.from(frameData.slice(0, 4)),
                                remaining: this.bufferCircular.available_read()
                            });
                            
                            if (totalRead === this.frameSize) {
                                // Update texture data
                                this.image.data.set(frameData);
                                this.needsUpdate = true;
                                
                                // Update debug plane texture
                                if (this.debugPlane?.material?.map) {
                                    // Get the debug texture
                                    const debugTexture = this.debugPlane.material.map;
                                    
                                    // Create new texture if dimensions don't match
                                    if (debugTexture.image.width !== this.image.width || 
                                        debugTexture.image.height !== this.image.height) {
                                        // Create new texture with correct dimensions
                                        const newTexture = new DataTexture(
                                            new Uint8Array(frameData.length),
                                            this.image.width,
                                            this.image.height,
                                            RGBAFormat,
                                            UnsignedByteType
                                        );
                                        
                                        // Configure texture
                                        newTexture.minFilter = LinearFilter;
                                        newTexture.magFilter = LinearFilter;
                                        newTexture.colorSpace = SRGBColorSpace;
                                        newTexture.needsUpdate = true;
                                        
                                        // Replace old texture
                                        this.debugPlane.material.map = newTexture;
                                        this.debugPlane.material.needsUpdate = true;
                                    }
                                    
                                    // Update texture data
                                    this.debugPlane.material.map.image.data.set(frameData);
                                    this.debugPlane.material.map.needsUpdate = true;
                                }
                            }
                        } catch (error) {
                            console.error('Error reading frame:', error);
                        }
                    }
                };

                // add this texture to list of updatable items
                this.updatables.push(texture);
                resolve(texture);
            });
        });
    }

    // pass marked textures to main function using result object
    afterRoot(result) {
        console.log('Processing video textures after root...');

        // make sure there is a list of updatable objects
        if (!result.userData.MPEG_media) {
            console.log('Creating MPEG_media userData object');
            result.userData.MPEG_media = {};
        }

        // make sure there is a list of updatable objects
        if (!result.userData.MPEG_media.updatables) {
            console.log('Creating updatables array');
            result.userData.MPEG_media.updatables = [];
        }

        // add our updatable textures to the list
        console.log('Adding', this.updatables.length, 'video textures to updatables');
        result.userData.MPEG_media.updatables.push(...this.updatables);

        // Check all materials in scene for video textures
        console.log('Checking materials in scene...');
        result.scene.traverse(node => {
            if (node.material) {
                console.log('Material found:', {
                    name: node.name,
                    material: node.material.name,
                    map: node.material.map ? 'present' : 'none',
                    videoTexture: node.material.map?.userData?.bufferInfo ? 'yes' : 'no'
                });

                // If this material has a video texture, configure it
                if (node.material.map?.userData?.bufferInfo) {
                    console.log('Setting up video material:', node.name);

                    // Configure material for video
                    node.material.transparent = false;
                    node.material.needsUpdate = true;

                    console.log('Video material configured:', {
                        materialType: node.material.type,
                        transparent: node.material.transparent,
                        textureFormat: node.material.map.format,
                        textureColorSpace: node.material.map.colorSpace,
                        dimensions: `${node.material.map.image.width}x${node.material.map.image.height}`
                    });
                }
            }
        });
    }
}