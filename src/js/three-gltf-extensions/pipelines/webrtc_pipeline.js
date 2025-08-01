import { MediaPipeline } from './media.js';
import { EventEmitter } from '../utils/event_emitter.js';
import { Swap3GPPClient } from '../utils/swap-3gpp-client.js';
import { bufferManager } from '../utils/buffer_manager.js';

/**
 * WebRTCPipeline class for handling WebRTC streaming via SWAP protocol
 * Integrates with MPEG_audio_spatial and MPEG_texture_video extensions
 * Updated to use 3GPP SWAP client
 */
export class WebRTCPipeline extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.swapServerUrl = null;
        this.swapCriteria = null;
        this.swapClient = null;
        this.peerConnection = null;
        this.remoteStream = null;
        this.videoElement = null;
        this.audioContext = null;
        this.videoDestination = null;
        this.audioDestination = null;
        this.isInitialized = false;
        this.videoProcessingInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.senderSource = null;
        this.isProcessingFrame = false;
        this.frameBuffer = null;
        this.imageData = null;
        this.circularBuffer = null;
        this.bufferId = null;
        
        // Store texture requirements from GLTF
        this.textureRequirements = config.textureRequirements || {
            width: 1280,
            height: 720,
            format: 'RGBA',
            frameSize: 1280 * 720 * 4
        };
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    async initialize(config) {
        if (this.isInitialized) {
            return;
        }

        try {
            // Parse SWAP URL and extract server and criteria
            const url = new URL(config.manifestUrl);
            if (url.protocol !== 'swap:') {
                throw new Error('Invalid SWAP URL protocol');
            }
            
            // Construct proper SWAP server URL
            this.swapServerUrl = `wss://${url.host}${url.pathname}`;
            this.swapCriteria = config.swapCriteria || 'siggraph2025';
            
            console.log('Initializing WebRTC pipeline with SWAP server:', this.swapServerUrl);
            console.log('Connection criteria:', this.swapCriteria);
            
            // Create off-screen video element for stream playback
            this.videoElement = document.createElement('video');
            this.videoElement.style.position = 'absolute';
            this.videoElement.style.left = '-9999px';
            this.videoElement.style.top = '-9999px';
            this.videoElement.style.width = '1px';
            this.videoElement.style.height = '1px';
            this.videoElement.style.opacity = '0';
            this.videoElement.style.pointerEvents = 'none';
            this.videoElement.setAttribute('aria-hidden', 'true');
            this.videoElement.playsInline = true;
            this.videoElement.autoplay = true;
            this.videoElement.muted = false;
            document.body.appendChild(this.videoElement);
            
            // Set up off-screen video processing canvas
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.textureRequirements.width;
            this.canvas.height = this.textureRequirements.height;
            // Canvas is not added to DOM - kept purely in memory
            
            this.context = this.canvas.getContext('2d', {
                willReadFrequently: true,
                alpha: false, // No alpha for better performance
                desynchronized: true // Allow async rendering
            });
            
            // Pre-allocate buffers for better performance
            this.frameBuffer = new Uint8ClampedArray(this.textureRequirements.frameSize);
            this.imageData = new ImageData(this.frameBuffer, this.textureRequirements.width, this.textureRequirements.height);
            
            // Create circular buffer for video frames (following MPEG-I architecture)
            this.bufferId = `webrtc-video-${Date.now()}`;
            const maxFrames = 3; // Triple buffering for smooth playback
            this.circularBuffer = bufferManager.createBuffer(
                this.bufferId,
                this.textureRequirements.width,
                this.textureRequirements.height,
                4, // RGBA
                maxFrames,
                Uint8Array
            );
            
            this.videoDestination = { 
                canvas: this.canvas, 
                context: this.context, 
                texture: null 
            };
            
            // Connect to SWAP server
            await this.connectToSwapServer();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('WebRTC pipeline initialization failed:', error);
            throw error;
        }
    }

    async connectToSwapServer() {
        try {
            console.log('Connecting to SWAP server:', this.swapServerUrl);
            
            // Create SWAP client
            this.swapClient = new Swap3GPPClient(this.swapServerUrl);
            
            // Set up event handlers
            this.swapClient.addEventListener('registered', () => {
                console.log('Successfully registered with SWAP server');
                this.emit('registered');
                
                // Create peer connection and send offer to sender
                this.createPeerConnectionAndOffer();
            });
            
            this.swapClient.addEventListener('connection-accepted', async (event) => {
                console.log('Connection accepted by sender');
                const answer = event.detail.answer;
                await this.handleAnswer(answer);
            });
            
            this.swapClient.addEventListener('connection-rejected', (event) => {
                console.log('Connection rejected:', event.detail.reason);
                this.emit('error', new Error(event.detail.reason));
            });
            
            this.swapClient.addEventListener('update', async (event) => {
                if (event.detail.update.candidate) {
                    await this.handleIceCandidate(event.detail.update.candidate);
                }
            });
            
            this.swapClient.addEventListener('connection-closed', () => {
                console.log('Connection closed by sender');
                this.closePeerConnection();
            });
            
            this.swapClient.addEventListener('disconnected', () => {
                console.log('Disconnected from SWAP server');
                this.handleDisconnection();
            });
            
            // Connect and register
            await this.swapClient.connect();
            await this.swapClient.register('receiver', this.swapCriteria);
            
            this.reconnectAttempts = 0;
            
        } catch (error) {
            console.error('Failed to connect to SWAP server:', error);
            throw error;
        }
    }

    async createPeerConnectionAndOffer() {
        try {
            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);
            
            // Add transceiver for receive-only
            this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
            this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
            
            // Handle incoming tracks
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                    this.videoElement.srcObject = this.remoteStream;
                }
                
                this.remoteStream.addTrack(event.track);
                
                if (event.track.kind === 'video') {
                    this.startVideoProcessing();
                } else if (event.track.kind === 'audio') {
                    this.setupAudioProcessing();
                }
            };
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.senderSource) {
                    this.swapClient.sendUpdate(this.senderSource, {
                        candidate: event.candidate
                    });
                }
            };
            
            // Monitor connection state
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                
                if (this.peerConnection.connectionState === 'connected') {
                    this.emit('connected');
                } else if (this.peerConnection.connectionState === 'failed') {
                    this.handleConnectionFailure();
                }
            };
            
            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Send connect request with offer
            await this.swapClient.connectToSender(this.swapCriteria, offer);
            
        } catch (error) {
            console.error('Failed to create peer connection:', error);
            throw error;
        }
    }

    async handleAnswer(answer) {
        try {
            if (!this.peerConnection) {
                throw new Error('No peer connection established');
            }
            
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Remote description set successfully');
            
            // Store sender source for ICE candidates
            const sessions = this.swapClient.getActiveSessions();
            if (sessions.length > 0) {
                this.senderSource = sessions[0];
            }
            
        } catch (error) {
            console.error('Failed to handle answer:', error);
            throw error;
        }
    }

    // Not needed for receivers in 3GPP SWAP - receivers send offers

    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    // Not needed - using swapClient methods instead

    startVideoProcessing() {
        console.log('Starting video processing');
        
        // Clear any existing interval
        if (this.videoProcessingInterval) {
            clearInterval(this.videoProcessingInterval);
        }
        
        // Process video frames at 30fps
        this.videoProcessingInterval = setInterval(() => {
            if (this.videoElement.readyState >= 2 && !this.videoElement.paused) {
                this.processVideoFrame();
            }
        }, 1000 / 30);
        
        this.emit('play');
    }

    processVideoFrame() {
        // Skip if we're still processing the previous frame
        if (this.isProcessingFrame) return;
        
        try {
            this.isProcessingFrame = true;
            const { canvas, context } = this.videoDestination;
            
            // Draw video frame to canvas
            context.drawImage(
                this.videoElement,
                0, 0,
                canvas.width,
                canvas.height
            );
            
            // Get pixel data
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // Copy to pre-allocated buffer
            this.frameBuffer.set(imageData.data);
            
            // Write frame to circular buffer (following MPEG-I architecture)
            const availableSpace = this.circularBuffer.available_write();
            const availableRead = this.circularBuffer.available_read();
            
            if (availableSpace >= this.textureRequirements.frameSize) {
                // Write frame data to ring buffer
                const bytesWritten = this.circularBuffer.push(this.frameBuffer);
                
                if (bytesWritten === this.textureRequirements.frameSize) {
                    // Emit frame ready event for texture update
                    this.emit('frameReady', {
                        bufferId: this.bufferId,
                        timestamp: performance.now()
                    });
                } else {
                    console.warn('WebRTC: Incomplete frame write to buffer');
                }
            } else {
                // Buffer full - drop frame to maintain real-time performance
                console.warn('WebRTC: Circular buffer full, dropping frame', {
                    availableWrite: availableSpace,
                    availableRead: availableRead,
                    frameSize: this.textureRequirements.frameSize,
                    capacity: this.circularBuffer.capacity
                });
            }
        } catch (error) {
            console.error('Error processing video frame:', error);
        } finally {
            this.isProcessingFrame = false;
        }
    }

    setupAudioProcessing() {
        console.log('Setting up audio processing');
        
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create media stream source from remote audio
        const audioTracks = this.remoteStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const source = this.audioContext.createMediaStreamSource(
                new MediaStream([audioTracks[0]])
            );
            
            // Emit audio source for spatial audio processing
            this.emit('audioSourceReady', {
                source: source,
                context: this.audioContext
            });
        }
    }

    stopVideoProcessing() {
        if (this.videoProcessingInterval) {
            clearInterval(this.videoProcessingInterval);
            this.videoProcessingInterval = null;
        }
        this.emit('pause');
    }

    closePeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        
        this.stopVideoProcessing();
    }

    handleDisconnection() {
        this.closePeerConnection();
        
        // Clean up SWAP client
        if (this.swapClient) {
            this.swapClient.disconnect();
            this.swapClient = null;
        }
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                this.connectToSwapServer().catch(error => {
                    console.error('Reconnection failed:', error);
                    this.handleDisconnection();
                });
            }, 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            this.emit('disconnected');
        }
    }

    handleConnectionFailure() {
        console.error('WebRTC connection failed');
        this.closePeerConnection();
        this.emit('connectionFailed');
    }

    async play() {
        if (this.videoElement) {
            await this.videoElement.play();
        }
    }

    pause() {
        if (this.videoElement) {
            this.videoElement.pause();
        }
        this.stopVideoProcessing();
    }

    stop() {
        this.pause();
        this.closePeerConnection();
        
        if (this.swapClient) {
            // Close connection if we have an active sender
            if (this.senderSource) {
                this.swapClient.closeConnection(this.senderSource);
            }
            this.swapClient.disconnect();
            this.swapClient = null;
        }
    }

    destroy() {
        this.stop();
        
        if (this.videoElement) {
            this.videoElement.remove();
            this.videoElement = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Clean up circular buffer
        if (this.bufferId) {
            bufferManager.removeBuffer(this.bufferId);
        }
        
        this.isInitialized = false;
    }

    getVideoElement() {
        return this.videoElement;
    }

    getAudioSource() {
        return this.audioDestination;
    }

    isPlaying() {
        return this.videoElement && !this.videoElement.paused;
    }

    getCurrentTime() {
        return this.videoElement ? this.videoElement.currentTime : 0;
    }

    getDuration() {
        return this.videoElement ? this.videoElement.duration : 0;
    }

    /**
     * Connect video texture for rendering
     * @param {Object} textureVideoExtension - The MPEG_texture_video extension
     * @param {string} sourceId - The source ID
     */
    connectVideoTexture(textureVideoExtension, sourceId) {
        console.log('Connecting video texture for WebRTC stream');
        
        // Store texture reference
        if (textureVideoExtension && textureVideoExtension.textures) {
            const texture = textureVideoExtension.textures.get(sourceId);
            if (texture) {
                // Replace the texture's buffer with the WebRTC pipeline's buffer
                texture.bufferCircular = this.circularBuffer;
                texture.frameSize = this.textureRequirements.frameSize;
                
                // Update texture dimensions to match WebRTC stream
                texture.userData.width = this.textureRequirements.width;
                texture.userData.height = this.textureRequirements.height;
                texture.userData.frameSize = this.textureRequirements.frameSize;
                
                // Ensure texture has proper image data buffer
                // THREE.DataTexture expects image to have data, width, and height properties
                if (!texture.image || !texture.image.data || 
                    texture.image.data.length !== this.textureRequirements.frameSize) {
                    // For DataTexture, image should be an object with data, width, height
                    const imageData = new Uint8Array(this.textureRequirements.frameSize);
                    texture.image = {
                        data: imageData,
                        width: this.textureRequirements.width,
                        height: this.textureRequirements.height
                    };
                    
                    // Also ensure the texture itself has correct dimensions
                    texture.image.width = this.textureRequirements.width;
                    texture.image.height = this.textureRequirements.height;
                    
                    // Re-initialize texture properties
                    texture.format = THREE.RGBAFormat;
                    texture.type = THREE.UnsignedByteType;
                    texture.needsUpdate = true;
                }
                
                // Register texture as consumer
                bufferManager.registerConsumer(this.bufferId, texture);
                
                console.log('WebRTC: Texture connected to circular buffer', {
                    bufferId: this.bufferId,
                    frameSize: this.textureRequirements.frameSize,
                    dimensions: `${this.textureRequirements.width}x${this.textureRequirements.height}`
                });
            }
        }
    }
}