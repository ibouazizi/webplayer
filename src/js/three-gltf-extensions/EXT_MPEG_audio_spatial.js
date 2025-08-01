import { AudioContext } from './pipelines/audio/audio_context.js';
import * as THREE from 'three';

/**
 * MPEG_audio_spatial extension
 * Implements spatial audio support for glTF using WebAudio API
 */
export class GLTFMPEGAudioSpatialExtension {
    constructor(parser) {
        this.name = 'MPEG_audio_spatial';
        this.parser = parser;
        this.audioContext = null; // Will be initialized on first user interaction
        this.sources = new Map();
        this.reverbs = new Map();
        this.listener = null;
        this.initialized = false;
    }

    // Load audio source implementation
    async loadSource(sourceIndex, sourceData) {
        const parser = this.parser;
        const audioContext = this.audioContext;

        // Create audio source based on type
        const source = {
            id: sourceData.id,
            type: sourceData.type,
            pregain: sourceData.pregain || 0,
            playbackSpeed: sourceData.playbackSpeed || 1,
            gainNode: audioContext.createGain(),
            panner: sourceData.type === 'Object' ? audioContext.createPannerNode() : null,
            hoaNode: sourceData.type === 'HOA' ? audioContext.createHOARenderer() : null
        };

        // Set up gain
        source.gainNode.gain.value = Math.pow(10, source.pregain / 20); // Convert dB to linear gain

        // Set up attenuation if specified
        if (sourceData.attenuation && sourceData.type === 'Object') {
            this.setupAttenuation(source.panner, sourceData);
        }

        // Set up reference distance
        if (sourceData.referenceDistance && source.panner) {
            source.panner.refDistance = sourceData.referenceDistance;
        }

        // Load audio data from accessors
        const audioBuffers = await Promise.all(
            sourceData.accessors.map(accessorIndex => 
                parser.getDependency('accessor', accessorIndex)
            )
        );

        // Create audio buffers and connect nodes
        source.buffers = audioBuffers;
        
        // Connect nodes based on type
        if (source.type === 'Object') {
            source.gainNode.connect(source.panner);
            source.panner.connect(audioContext.destination);
        } else { // HOA
            source.gainNode.connect(source.hoaNode);
            source.hoaNode.connect(audioContext.destination);
        }

        // Set up reverb connections if specified
        if (sourceData.reverbFeed) {
            this.setupReverbConnections(source, sourceData);
        }

        this.sources.set(sourceData.id, source);
        return source;
    }

    // Load reverb implementation
    async loadReverb(reverbData) {
        const audioContext = this.audioContext;
        const reverb = {
            id: reverbData.id,
            bypass: reverbData.bypass || true,
            convolver: audioContext.createConvolver(),
            predelay: reverbData.predelay || 0
        };

        // Create impulse response from properties
        const impulseResponse = this.createImpulseResponse(reverbData.properties);
        reverb.convolver.buffer = impulseResponse;

        // Add predelay if specified
        if (reverb.predelay > 0) {
            reverb.delayNode = audioContext.createDelay(reverb.predelay);
            reverb.delayNode.delayTime.value = reverb.predelay;
            reverb.delayNode.connect(reverb.convolver);
        }

        this.reverbs.set(reverbData.id, reverb);
        return reverb;
    }

    // Load listener implementation
    loadListener(listenerData) {
        const audioContext = this.audioContext;
        this.listener = {
            id: listenerData.id,
            listener: audioContext.listener
        };
        return this.listener;
    }

    // Helper method to set up attenuation
    setupAttenuation(panner, sourceData) {
        switch (sourceData.attenuation) {
            case 'inverseDistance':
                panner.distanceModel = 'inverse';
                break;
            case 'linearDistance':
                panner.distanceModel = 'linear';
                break;
            case 'exponentialDistance':
                panner.distanceModel = 'exponential';
                break;
            case 'noAttenuation':
                panner.distanceModel = 'none';
                break;
            case 'custom':
                // Custom attenuation requires implementation-specific handling
                console.warn('Custom attenuation not implemented');
                break;
        }

        if (sourceData.attenuationParameters) {
            // Apply attenuation parameters based on the model
            // This is a simplified implementation
            const [rolloffFactor = 1] = sourceData.attenuationParameters;
            panner.rolloffFactor = rolloffFactor;
        }
    }

    // Helper method to set up reverb connections
    setupReverbConnections(source, sourceData) {
        const audioContext = this.audioContext;
        
        sourceData.reverbFeed.forEach((reverbId, index) => {
            const reverb = this.reverbs.get(reverbId);
            if (reverb && !reverb.bypass) {
                const reverbGain = audioContext.createGain();
                const gain = sourceData.reverbFeedGain?.[index] || 0;
                reverbGain.gain.value = Math.pow(10, gain / 20); // Convert dB to linear gain

                if (source.type === 'Object') {
                    source.panner.connect(reverbGain);
                } else {
                    source.hoaNode.connect(reverbGain);
                }

                if (reverb.delayNode) {
                    reverbGain.connect(reverb.delayNode);
                } else {
                    reverbGain.connect(reverb.convolver);
                }
            }
        });
    }

    // Helper method to create impulse response from reverb properties
    createImpulseResponse(properties) {
        const audioContext = this.audioContext;
        const sampleRate = audioContext.sampleRate;
        const maxRT60 = Math.max(...properties.map(p => p.RT60));
        const length = Math.ceil(maxRT60 * sampleRate);
        const impulseResponse = audioContext.createBuffer(2, length, sampleRate);

        // Create exponential decay for each frequency band
        for (const prop of properties) {
            const decay = Math.pow(0.001, 1 / (prop.RT60 * sampleRate));
            const frequency = prop.frequency;
            const dsr = Math.pow(10, prop.DSR / 20); // Convert dB to linear

            // Simple implementation - in practice you'd want to use proper filters
            // for each frequency band and more sophisticated reverb generation
            for (let channel = 0; channel < 2; channel++) {
                const channelData = impulseResponse.getChannelData(channel);
                let amplitude = dsr;
                
                for (let i = 0; i < length; i++) {
                    channelData[i] += amplitude * (Math.random() * 2 - 1);
                    amplitude *= decay;
                }
            }
        }

        return impulseResponse;
    }

    // Update method to be called in the render loop
    update(scene, camera) {
        if (!this.listener || !camera) return;

        // Update listener position based on camera
        const listener = this.listener.listener;
        const cameraPosition = camera.position;
        const cameraRotation = camera.rotation;
        
        listener.positionX.value = cameraPosition.x;
        listener.positionY.value = cameraPosition.y;
        listener.positionZ.value = cameraPosition.z;

        // Convert camera rotation to forward and up vectors
        const forward = new THREE.Vector3(0, 0, -1);
        const up = new THREE.Vector3(0, 1, 0);
        forward.applyEuler(cameraRotation);
        up.applyEuler(cameraRotation);

        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;

        // Update audio source positions
        scene.traverse(node => {
            if (node.userData.audioSourceId !== undefined) {
                const source = this.sources.get(node.userData.audioSourceId);
                if (source && source.panner) {
                    const worldPosition = node.getWorldPosition(new THREE.Vector3());
                    source.panner.positionX.value = worldPosition.x;
                    source.panner.positionY.value = worldPosition.y;
                    source.panner.positionZ.value = worldPosition.z;
                }
            }
        });
    }

    // Clean up resources
    dispose() {
        this.sources.forEach(source => {
            source.gainNode?.disconnect();
            source.panner?.disconnect();
            source.hoaNode?.disconnect();
        });

        this.reverbs.forEach(reverb => {
            reverb.convolver?.disconnect();
            reverb.delayNode?.disconnect();
        });

        this.audioContext.close();
    }
}