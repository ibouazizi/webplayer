import { MediaPipeline } from './media.js';
import dashjs from 'dashjs';
import { EventEmitter } from '../utils/event_emitter.js';

/**
 * AVPipeline class for handling DASH streaming and media decoding
 * Integrates with MPEG_audio_spatial and MPEG_texture_video extensions
 */
export class AVPipeline extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.dashPlayer = null;
        this.videoElement = null;
        this.audioContext = null;
        this.mediaSource = null;
        this.videoDestination = null;
        this.audioDestination = null;
        this.isInitialized = false;
        this.videoProcessingInterval = null;
        this.videoSources = new Map(); // Add this to store video sources

        // Store texture requirements from GLTF
        this.textureRequirements = config.textureRequirements || {
            width: 640,   // Default width if not specified
            height: 360,  // Default height if not specified
            format: 'RGBA',
            frameSize: 640 * 360 * 4
        };
        
    }

    async initialize(config) {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize video element and dash.js player
            this.videoElement = document.createElement('video');
            this.videoElement.style.display = 'none';
            this.videoElement.playsInline = true;
            this.videoElement.crossOrigin = 'anonymous';
            this.videoElement.muted = false; // Allow audio
            this.videoElement.volume = 1.0;  // Set full volume
            document.body.appendChild(this.videoElement);

            this.dashPlayer = dashjs.MediaPlayer().create();
            this.dashPlayer.initialize(this.videoElement, config.manifestUrl, false);

            // Set up video processing
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', {
                willReadFrequently: true,
                alpha: true,
                desynchronized: false
            });
            
            this.videoDestination = { canvas, context, texture: null };
            this.setupEventListeners();
            this.isInitialized = true;

        } catch (error) {
            throw error;
        }
    }

    setupEventListeners() {
        this.videoElement.addEventListener('play', () => this.startVideoProcessing());
        this.videoElement.addEventListener('pause', () => this.stopVideoProcessing());
        this.videoElement.addEventListener('ended', () => this.emit('ended'));
    }

    startVideoProcessing() {
        
        // Log initial state
        const initialState = {
            readyState: this.videoElement?.readyState,
            paused: this.videoElement?.paused,
            currentTime: this.videoElement?.currentTime,
            videoWidth: this.videoElement?.videoWidth,
            videoHeight: this.videoElement?.videoHeight,
            hasVideoData: !!this.videoElement?.videoWidth && !!this.videoElement?.videoHeight,
            buffered: Array.from(this.videoElement?.buffered || []).map(i => ({
                start: this.videoElement.buffered.start(i),
                end: this.videoElement.buffered.end(i)
            }))
        };

        // Only add DASH info if stream is active
        if (this.dashPlayer.getActiveStream()) {
            initialState.dashInfo = {
                streamInfo: this.dashPlayer.getActiveStream().getStreamInfo(),
                quality: this.dashPlayer.getQualityFor('video'),
                bitrateInfo: this.dashPlayer.getBitrateInfoListFor('video'),
                currentTrack: this.dashPlayer.getCurrentTrackFor('video')
            };
        }
        

        if (!this.videoProcessingInterval && this.videoElement.readyState >= 2) {
            const frameRate = this.dashPlayer.getVideoElement().playbackRate || 30;
            
            // Track frame processing metrics
            let frameCount = 0;
            let lastFrameTime = performance.now();
            
            this.videoProcessingInterval = setInterval(() => {
                const now = performance.now();
                const timeSinceLastFrame = now - lastFrameTime;
                
                lastFrameTime = now;
                this.processVideoFrame();
            }, 1000 / frameRate);
            
        } else {
            console.log('[AVPipeline] Cannot start video processing:', {
                hasInterval: !!this.videoProcessingInterval,
                readyState: this.videoElement?.readyState,
                requiredReadyState: 2,
                videoElement: !!this.videoElement,
                dashPlayer: !!this.dashPlayer
            });
        }
    }

    stopVideoProcessing() {
        if (this.videoProcessingInterval) {
            clearInterval(this.videoProcessingInterval);
            this.videoProcessingInterval = null;
        }
    }

    processVideoFrame() {
        if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
            console.log('[AVPipeline] Video not ready:', {
                exists: !!this.videoElement,
                paused: this.videoElement?.paused,
                ended: this.videoElement?.ended
            });
            return;
        }

        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        const targetWidth = this.textureRequirements.width;
        const targetHeight = this.textureRequirements.height;
        
        if (!videoWidth || !videoHeight) {
            console.log('[AVPipeline] Invalid source dimensions, skipping frame');
            return;
        }

        try {
            // Set canvas to target dimensions
            this.videoDestination.canvas.width = targetWidth;
            this.videoDestination.canvas.height = targetHeight;

            // Clear canvas and set background to black
            this.videoDestination.context.fillStyle = '#000000';
            this.videoDestination.context.fillRect(0, 0, targetWidth, targetHeight);

            // Calculate scaling and positioning to maintain aspect ratio
            const sourceAspect = videoWidth / videoHeight;
            const targetAspect = targetWidth / targetHeight;
            let drawWidth = targetWidth;
            let drawHeight = targetHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (sourceAspect > targetAspect) {
                // Source is wider - scale to target height
                drawHeight = targetHeight;
                drawWidth = drawHeight * sourceAspect;
                offsetX = (targetWidth - drawWidth) / 2;
            } else {
                // Source is taller - scale to target width
                drawWidth = targetWidth;
                drawHeight = drawWidth / sourceAspect;
                offsetY = (targetHeight - drawHeight) / 2;
            }

            // Enable image smoothing for better quality
            this.videoDestination.context.imageSmoothingEnabled = true;
            this.videoDestination.context.imageSmoothingQuality = 'high';

            // Draw video frame with proper scaling
            this.videoDestination.context.drawImage(
                this.videoElement,
                offsetX, offsetY, drawWidth, drawHeight
            );

            // Get frame data at target dimensions
            const imageData = this.videoDestination.context.getImageData(0, 0, targetWidth, targetHeight);

            // Create frame object
            const frame = {
                data: imageData.data,
                width: imageData.width,
                height: imageData.height,
                timestamp: this.videoElement.currentTime
            };

            // Check if we have any listeners before emitting
            const listeners = this._events.get('videoFrame') || [];


            if (listeners.length > 0) {
                this.emit('videoFrame', frame);
            } else {
                console.log('[AVPipeline] No listeners for videoFrame event');
            }
            
        } catch (error) {
            console.error('[AVPipeline] Error processing video frame:', error);
        }
    }

    connectAudioSource(audioExtension, sourceId) {
        if (!audioExtension || !sourceId) {
            console.error('[AVPipeline] Invalid audio connection parameters:', {
                hasExtension: !!audioExtension,
                sourceId
            });
            return;
        }

        try {
            // Get the audio source from the extension
            const source = audioExtension.sources.get(sourceId);
            if (!source) {
                console.error('[AVPipeline] Audio source not found:', sourceId);
                return;
            }

            // Connect video element's audio output to the audio context
            if (!this.audioContext) {
                this.audioContext = audioExtension.audioContext;
            }

            // Create media element source if not exists
            if (!this.mediaElementSource) {
                this.mediaElementSource = this.audioContext.createMediaElementSource(this.videoElement);
            }

            // Connect to the audio source's gain node
            this.mediaElementSource.connect(source.gainNode);

            console.log('[AVPipeline] Audio connection established:', {
                sourceId,
                audioContext: this.audioContext.state,
                sampleRate: this.audioContext.sampleRate
            });

        } catch (error) {
            console.error('[AVPipeline] Error connecting audio:', error);
        }
    }

    connectVideoTexture(textureExtension, sourceId) {
        // Get the texture first since it contains the MPEG metadata
        const texture = textureExtension.textures.get(sourceId);
        if (!texture) {
            console.error('[AVPipeline] Texture not found:', {
                sourceId,
                availableIds: Array.from(textureExtension.textures.keys())
            });
            throw new Error(`Texture ${sourceId} not found`);
        }

        // Get MPEG texture information
        const mpegInfo = texture.userData.mpegTextureInfo;

        // Get the video source
        const videoSource = textureExtension.sources.get(sourceId);
        if (!videoSource) {
            console.error('[AVPipeline] Video source not found:', {
                sourceId,
                availableIds: Array.from(textureExtension.sources.keys())
            });
            throw new Error(`Video source ${sourceId} not found`);
        }

        // Store video source in our map
        if (!this.videoSources) {
            this.videoSources = new Map();
        }
        this.videoSources.set(sourceId, videoSource);

        // Set up frame handler
        const frameHandler = (frame) => {
            const videoSource = this.videoSources.get(sourceId);
            if (!videoSource) {
                console.error('[AVPipeline] Video source not found for frame:', sourceId);
                return;
            }
            const circularBuffer = videoSource.circularBuffer;
            if (circularBuffer) {
                // Check frame dimensions match buffer requirements
                if (frame.width !== mpegInfo.width || frame.height !== mpegInfo.height) {
                    console.error('Frame dimensions mismatch:', {
                        got: `${frame.width}x${frame.height}`,
                        expected: `${mpegInfo.width}x${mpegInfo.height}`
                    });
                    return;
                }

                // Write frame to ring buffer
                try {
                    // Write frame data to ring buffer
                    const frameData = new Uint8Array(frame.data);
                    const availableSpace = circularBuffer.available_write();
                    const capacity = circularBuffer.capacity;

                    // If buffer is full, remove oldest frame
                    if (circularBuffer.count >= circularBuffer.maxFrames) {
                        const oldData = new Uint8Array(frameData.length);
                        circularBuffer.pop(oldData);
                        circularBuffer.count--;
                    }

                    // Write new frame
                    const bytesWritten = circularBuffer.push(frameData);
                    circularBuffer.count++;
  
                } catch (error) {
                    console.error('[AVPipeline] Error writing frame to ring buffer:', error);
                }
            }
        };

        // Register the frame handler
        this.on('videoFrame', frameHandler);
    }

    async play() {
        try {
            // Resume audio context if it exists
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('[AVPipeline] Audio context resumed:', this.audioContext.state);
            }

            // Wait for DASH stream to be ready
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for DASH stream'));
                }, 10000);

                const checkStream = () => {
                    if (this.dashPlayer.getActiveStream()) {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        setTimeout(checkStream, 100);
                    }
                };
                checkStream();
            });



            // Add event listeners for video state
            this.videoElement.addEventListener('playing', () => {
                console.log('[AVPipeline] Video playing:', {
                    time: this.videoElement.currentTime,
                    muted: this.videoElement.muted,
                    volume: this.videoElement.volume,
                    audioTracks: this.videoElement.audioTracks?.length || 0,
                    audioContext: this.audioContext?.state,
                    hasAudioSource: !!this.mediaElementSource
                });

                // Start frame processing when video starts playing
                this.startVideoProcessing();
            });

            this.videoElement.addEventListener('timeupdate', () => {

            });

            await this.videoElement.play();
        } catch (error) {
            console.error('[AVPipeline] Error playing video:', error);
            throw error;
        }
    }

    pause() {
        this.videoElement.pause();
    }

    stop() {
        this.videoElement.pause();
        this.videoElement.currentTime = 0;
    }
}