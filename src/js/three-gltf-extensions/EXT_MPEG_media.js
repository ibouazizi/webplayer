import { AVPipeline } from './pipelines/av_pipeline.js';

/**
 *   MPEG_media Extension
 *   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_media
 *         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_media
 *   MPEG_media provides an array of MPEG media items referenced by other extensions in glTF document.
 *
 *   This implementation adds support for DASH streaming through the AVPipeline class.
 */
export class GLTFMPEGMediaExtension {
    constructor(parser) {
        this.name = 'MPEG_media';
        this.parser = parser;
        this.metadata = null;
        this.pipelines = new Map();

        if (!parser.json.extensions) {
            console.warn("no extensions found in file.");
            return;
        }
        
        if (!this.parser.json.extensions.MPEG_media) {
            console.warn("MPEG_media not found in file.");
            return;
        }
        
        this.metadata = this.parser.json.extensions.MPEG_media;
    }

    /**
     * Create a pipeline for a media item
     * @param {number} mediaIndex Index of the media item
     * @param {Object} options Pipeline options
     * @returns {AVPipeline} The created pipeline
     */
    async createPipeline(mediaIndex, options = {}) {
        if (!this.metadata || !this.metadata.media) {
            throw new Error('No media metadata available');
        }

        const mediaItem = this.metadata.media[mediaIndex];
        if (!mediaItem) {
            throw new Error(`Media item ${mediaIndex} not found`);
        }

        // Check if pipeline already exists
        if (this.pipelines.has(mediaIndex)) {
            return this.pipelines.get(mediaIndex);
        }

        // Create new pipeline
        console.log('=== Creating Media Pipeline ===');
        
        // Get texture information from the MPEG_texture_video extension
        const textureInfo = this.parser.json.textures.find(texture => 
            texture.extensions?.MPEG_texture_video?.accessor !== undefined
        )?.extensions?.MPEG_texture_video;

        if (!textureInfo) {
            throw new Error('No MPEG_texture_video extension found in GLTF');
        }

        // Create pipeline with texture requirements
        const pipeline = new AVPipeline({
            textureRequirements: {
                width: textureInfo.width,
                height: textureInfo.height,
                format: textureInfo.format,
                frameSize: textureInfo.width * textureInfo.height * 4 // RGBA = 4 bytes
            }
        });

        // Get the first available alternative
        const alternative = mediaItem.alternatives[0];
        if (!alternative) {
            throw new Error(`No alternatives found for media ${mediaIndex}`);
        }

        // Check if this is a DASH manifest
        console.log('Media type:', alternative.mimeType);
        const isDASH = alternative.mimeType === 'application/dash+xml';
        if (!isDASH) {
            throw new Error(`Unsupported media type: ${alternative.mimeType}`);
        }

        // Handle URI resolution
        let manifestUrl = alternative.uri;
        
        // Only resolve relative to glTF if the URI is not absolute
        if (!manifestUrl.startsWith('http://') && !manifestUrl.startsWith('https://')) {
            const baseUri = this.parser.options.path || '';
            manifestUrl = baseUri + manifestUrl;
        }

        try {
            await pipeline.initialize({
                manifestUrl,
                textureRequirements: {
                    width: textureInfo.width,
                    height: textureInfo.height,
                    format: textureInfo.format,
                    frameSize: textureInfo.width * textureInfo.height * 4 // RGBA = 4 bytes
                },
                ...options
            });
        } catch (error) {
            console.error('Pipeline initialization failed:', error);
            throw error;
        }

        // Store pipeline for reuse
        this.pipelines.set(mediaIndex, pipeline);

        return pipeline;
    }

    /**
     * Get a pipeline for a media item
     * @param {number} mediaIndex Index of the media item
     * @returns {AVPipeline|null} The pipeline or null if not found
     */
    getPipeline(mediaIndex) {
        return this.pipelines.get(mediaIndex) || null;
    }

    /**
     * Clean up resources
     */
    dispose() {
        for (const pipeline of this.pipelines.values()) {
            pipeline.dispose();
        }
        this.pipelines.clear();
    }
}