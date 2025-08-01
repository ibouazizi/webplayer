import { Swap3GPPClient } from './swap-3gpp-client.js';

/**
 * WebRTC Sender Application
 * Uses Web Workers for performance optimization
 */
class SenderApplication {
    constructor() {
        this.swapClient = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.isStreaming = false;
        this.isUpdatingStream = false; // Prevent concurrent updates
        
        // Initialize Web Worker for stats monitoring
        this.statsWorker = new Worker('./stats-worker.js');
        this.statsWorker.addEventListener('message', this.handleWorkerMessage.bind(this));
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        // Media constraints
        this.mediaConstraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        
        // Use requestIdleCallback for non-critical UI updates
        this.pendingUIUpdates = new Map();
        this.scheduleIdleUpdate = this.scheduleIdleUpdate.bind(this);
        
        this.initializeUI();
        this.loadMediaDevices();
    }

    initializeUI() {
        // Get UI elements
        this.elements = {
            serverUrl: document.getElementById('serverUrl'),
            criteria: document.getElementById('criteria'),
            wsEndpoint: document.getElementById('wsEndpoint'),
            videoSource: document.getElementById('videoSource'),
            audioSource: document.getElementById('audioSource'),
            resolution: document.getElementById('resolution'),
            startButton: document.getElementById('startButton'),
            stopButton: document.getElementById('stopButton'),
            status: document.getElementById('status'),
            localVideo: document.getElementById('localVideo'),
            viewerCount: document.getElementById('viewerCount'),
            bitrate: document.getElementById('bitrate'),
            fps: document.getElementById('fps'),
            latency: document.getElementById('latency')
        };
        
        // Attach event listeners
        this.elements.startButton.addEventListener('click', () => this.startStreaming());
        this.elements.stopButton.addEventListener('click', () => this.stopStreaming());
        
        // Debounce media device changes to avoid frequent updates
        let updateTimeout;
        const debouncedUpdate = () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => this.updateMediaStream(), 300);
        };
        
        this.elements.videoSource.addEventListener('change', debouncedUpdate);
        this.elements.audioSource.addEventListener('change', debouncedUpdate);
        this.elements.resolution.addEventListener('change', debouncedUpdate);
    }

    handleWorkerMessage(event) {
        const { type, data } = event.data;
        
        if (type === 'stats') {
            // Schedule UI update during idle time
            this.scheduleIdleUpdate('stats', () => {
                this.elements.bitrate.textContent = data.bitrate;
                this.elements.fps.textContent = Math.round(data.fps);
                this.elements.latency.textContent = data.latency;
                this.elements.viewerCount.textContent = data.viewerCount;
                
                if (data.viewerCount > 0) {
                    this.updateStatus(`Streaming to ${data.viewerCount} viewer(s)`, 'connected');
                } else if (this.isStreaming) {
                    this.updateStatus('Streaming (waiting for viewers)', 'connected');
                }
            });
        }
    }

    scheduleIdleUpdate(key, callback) {
        // Cancel any pending update for this key
        if (this.pendingUIUpdates.has(key)) {
            cancelIdleCallback(this.pendingUIUpdates.get(key));
        }
        
        // Schedule new update during idle time
        const handle = requestIdleCallback(() => {
            callback();
            this.pendingUIUpdates.delete(key);
        }, { timeout: 100 }); // Max 100ms delay
        
        this.pendingUIUpdates.set(key, handle);
    }

    async loadMediaDevices() {
        // Run device enumeration in background
        requestIdleCallback(async () => {
            try {
                // Get permissions if needed
                let tempStream = null;
                try {
                    tempStream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: true 
                    });
                } catch (permError) {
                    console.warn('Could not get media permissions:', permError);
                }
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                
                // Update UI during idle time
                this.scheduleIdleUpdate('devices', () => {
                    // Clear existing options
                    this.elements.videoSource.innerHTML = '<option value="">No video</option>';
                    this.elements.audioSource.innerHTML = '<option value="">No audio</option>';
                    
                    // Add camera/screen share option
                    const screenOption = document.createElement('option');
                    screenOption.value = 'screen';
                    screenOption.textContent = 'Screen Share';
                    this.elements.videoSource.appendChild(screenOption);
                    
                    // Populate device lists
                    let videoCount = 0;
                    let audioCount = 0;
                    
                    devices.forEach(device => {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        
                        if (device.kind === 'videoinput') {
                            videoCount++;
                            option.textContent = device.label || `Camera ${videoCount}`;
                            this.elements.videoSource.appendChild(option);
                        } else if (device.kind === 'audioinput') {
                            audioCount++;
                            option.textContent = device.label || `Microphone ${audioCount}`;
                            this.elements.audioSource.appendChild(option);
                        }
                    });
                    
                    // Select first available devices
                    if (this.elements.videoSource.options.length > 2) {
                        this.elements.videoSource.selectedIndex = 2;
                    }
                    if (this.elements.audioSource.options.length > 1) {
                        this.elements.audioSource.selectedIndex = 1;
                    }
                });
                
                // Clean up temp stream
                if (tempStream) {
                    tempStream.getTracks().forEach(track => track.stop());
                }
                
            } catch (error) {
                console.error('Failed to enumerate devices:', error);
                this.updateStatus('Failed to load media devices', 'disconnected');
            }
        });
    }

    async updateMediaStream() {
        if (!this.isStreaming || this.isUpdatingStream) return;
        
        // Set flag to prevent concurrent updates
        this.isUpdatingStream = true;
        
        // Perform media update asynchronously
        requestAnimationFrame(async () => {
            try {
                const newStream = await this.getMediaStream();
                const oldStream = this.localStream;
                
                // First update all peer connections
                const updatePromises = Array.from(this.peerConnections.entries()).map(
                    async ([receiverId, pc]) => {
                        const senders = pc.getSenders();
                        
                        for (const track of newStream.getTracks()) {
                            const sender = senders.find(s => s.track && s.track.kind === track.kind);
                            if (sender) {
                                await sender.replaceTrack(track);
                            }
                        }
                    }
                );
                
                await Promise.all(updatePromises);
                
                // Update local preview and stream reference
                this.localStream = newStream;
                this.elements.localVideo.srcObject = newStream;
                
                // Stop old tracks only after successful replacement
                if (oldStream) {
                    // Give a small delay to ensure smooth transition
                    setTimeout(() => {
                        oldStream.getTracks().forEach(track => track.stop());
                    }, 100);
                }
                
            } catch (error) {
                console.error('Failed to update media stream:', error);
                // Don't stop existing stream on error
            } finally {
                // Always reset the flag
                this.isUpdatingStream = false;
            }
        });
    }

    async getMediaStream() {
        const videoSource = this.elements.videoSource.value;
        const audioSource = this.elements.audioSource.value;
        const resolution = this.elements.resolution.value.split('x');
        
        if (!videoSource && !audioSource) {
            throw new Error('Please select at least one media source');
        }
        
        // Update constraints with more flexible settings for camera stability
        this.mediaConstraints.video = videoSource ? {
            width: { ideal: parseInt(resolution[0]) },
            height: { ideal: parseInt(resolution[1]) },
            frameRate: { ideal: 30, max: 30 },
            // Add these constraints to help with camera stability
            facingMode: "user",
            resizeMode: "crop-and-scale"
        } : false;
        
        this.mediaConstraints.audio = audioSource ? {
            deviceId: audioSource,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } : false;
        
        // Handle screen share
        if (videoSource === 'screen') {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: this.mediaConstraints.video,
                audio: false
            });
            
            if (audioSource) {
                const audioStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: this.mediaConstraints.audio
                });
                
                audioStream.getAudioTracks().forEach(track => {
                    screenStream.addTrack(track);
                });
            }
            
            return screenStream;
        } else {
            if (videoSource && videoSource !== '') {
                this.mediaConstraints.video.deviceId = { exact: videoSource };
            }
            
            return await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
        }
    }

    async startStreaming() {
        try {
            this.updateStatus('Connecting...', 'connecting');
            
            // Get media stream
            this.localStream = await this.getMediaStream();
            this.elements.localVideo.srcObject = this.localStream;
            
            // Connect to SWAP server
            const serverUrl = this.elements.serverUrl.value;
            const criteria = this.elements.criteria.value;
            
            this.swapClient = new Swap3GPPClient(serverUrl);
            
            // Set up event handlers
            this.setupSwapEventHandlers();
            
            // Connect and register
            await this.swapClient.connect();
            await this.swapClient.register('sender', criteria);
            
            // Start stats monitoring in worker
            this.statsWorker.postMessage({
                command: 'init',
                data: { interval: 1000 }
            });
            
        } catch (error) {
            console.error('Failed to start streaming:', error);
            this.updateStatus(`Error: ${error.message}`, 'disconnected');
            this.stopStreaming();
        }
    }

    setupSwapEventHandlers() {
        this.swapClient.addEventListener('registered', () => {
            console.log('Registered as sender');
            this.updateStatus('Streaming (waiting for viewers)', 'connected');
            this.isStreaming = true;
            this.updateButtons();
        });
        
        this.swapClient.addEventListener('connect-request', (event) => {
            // Handle connection request in background
            requestIdleCallback(() => this.handleConnectRequest(event.detail));
        });
        
        this.swapClient.addEventListener('update', (event) => {
            if (event.detail.update.candidate) {
                // Handle ICE candidate in background
                requestIdleCallback(() => 
                    this.handleIceCandidate(event.detail.source, event.detail.update.candidate)
                );
            }
        });
        
        this.swapClient.addEventListener('connection-closed', (event) => {
            this.handleReceiverDisconnected(event.detail.source);
        });
        
        this.swapClient.addEventListener('disconnected', () => {
            this.updateStatus('Disconnected', 'disconnected');
            this.stopStreaming();
        });
    }

    async handleConnectRequest(data) {
        const receiverSource = data.source;
        const offer = data.offer;
        
        try {
            // Create peer connection
            const pc = new RTCPeerConnection(this.rtcConfig);
            this.peerConnections.set(receiverSource, pc);
            
            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
            
            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    // Send ICE candidate in background
                    requestIdleCallback(() => {
                        this.swapClient.sendUpdate(receiverSource, {
                            candidate: event.candidate
                        });
                    });
                }
            };
            
            // Monitor connection state
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    this.handleReceiverDisconnected(receiverSource);
                }
            };
            
            // Set remote description and create answer
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Accept the connection
            await this.swapClient.acceptConnection(receiverSource, answer);
            
            // Notify worker about new connection
            this.statsWorker.postMessage({
                command: 'addConnection',
                data: { id: receiverSource, pc }
            });
            
        } catch (error) {
            console.error('Failed to handle connect request:', error);
            await this.swapClient.rejectConnection(receiverSource, error.message);
        }
    }

    async handleIceCandidate(source, candidate) {
        const pc = this.peerConnections.get(source);
        if (!pc) return;
        
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    handleReceiverDisconnected(source) {
        const pc = this.peerConnections.get(source);
        if (pc) {
            pc.close();
            this.peerConnections.delete(source);
        }
        
        // Notify worker about disconnection
        this.statsWorker.postMessage({
            command: 'removeConnection',
            data: { id: source }
        });
    }

    stopStreaming() {
        // Stop stats monitoring
        this.statsWorker.postMessage({ command: 'stop' });
        
        // Close all peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Disconnect from SWAP server
        if (this.swapClient) {
            this.swapClient.disconnect();
            this.swapClient = null;
        }
        
        // Cancel pending UI updates
        this.pendingUIUpdates.forEach(handle => cancelIdleCallback(handle));
        this.pendingUIUpdates.clear();
        
        // Update UI
        this.elements.localVideo.srcObject = null;
        this.isStreaming = false;
        this.updateButtons();
        this.updateStatus('Disconnected', 'disconnected');
        
        // Clear stats display
        this.scheduleIdleUpdate('stats', () => {
            this.elements.viewerCount.textContent = '0';
            this.elements.bitrate.textContent = '0';
            this.elements.fps.textContent = '0';
            this.elements.latency.textContent = '0';
        });
    }

    updateStatus(message, state) {
        this.scheduleIdleUpdate('status', () => {
            this.elements.status.textContent = message;
            this.elements.status.className = `status ${state}`;
        });
    }

    updateButtons() {
        this.scheduleIdleUpdate('buttons', () => {
            this.elements.startButton.disabled = this.isStreaming;
            this.elements.stopButton.disabled = !this.isStreaming;
        });
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SenderApplication();
});