/**
 * Wrapper for WebAudio AudioContext with additional functionality
 * for spatial audio and HOA (Higher Order Ambisonics)
 */
export class AudioContext extends window.AudioContext {
    constructor(options = {}) {
        super(options);
        this.isUnlocked = false;
        this.unlockAudioContext();
    }

    /**
     * Create a PannerNode with default spatial audio settings
     */
    createPannerNode() {
        const panner = this.createPanner();
        
        // Set default properties for spatial audio
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 0;
        panner.coneOuterGain = 0;

        return panner;
    }

    /**
     * Create an HOA (Higher Order Ambisonics) renderer
     * This is a basic implementation - in practice you'd want to use a proper HOA library
     */
    createHOARenderer() {
        // This is a simplified HOA implementation
        // In practice, you'd want to use a proper HOA library like JSAmbisonics
        const hoaOrder = 1; // First order ambisonics
        const numberOfChannels = (hoaOrder + 1) * (hoaOrder + 1);
        
        // Create a channel merger for HOA channels
        const merger = this.createChannelMerger(numberOfChannels);
        
        // Create convolver for HRTF-based rendering
        const convolver = this.createConvolver();
        
        // In practice, you'd load proper HRTF impulse responses here
        // This is just a placeholder
        const dummyIR = this.createBuffer(2, 512, this.sampleRate);
        convolver.buffer = dummyIR;

        merger.connect(convolver);
        
        // Return an object that mimics a normal audio node interface
        return {
            connect(destination) {
                convolver.connect(destination);
            },
            disconnect() {
                convolver.disconnect();
            },
            // Add methods for setting/getting HOA parameters
            setRotationMatrix(matrix) {
                // Implementation would go here
                console.log('HOA rotation matrix update not implemented');
            }
        };
    }

    /**
     * Unlock audio context on iOS and other platforms that require user interaction
     */
    async unlockAudioContext() {
        if (this.isUnlocked) return;

        // Create and play a short silent buffer
        const buffer = this.createBuffer(1, 1, 22050);
        const source = this.createBufferSource();
        source.buffer = buffer;
        source.connect(this.destination);

        // Play the silent buffer on user interaction
        const unlock = async () => {
            if (this.isUnlocked) return;

            // Play the silent buffer
            source.start(0);
            this.isUnlocked = true;

            // Remove the event listeners
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('touchend', unlock);
            document.removeEventListener('click', unlock);
        };

        // Add event listeners for user interaction
        document.addEventListener('touchstart', unlock, false);
        document.addEventListener('touchend', unlock, false);
        document.addEventListener('click', unlock, false);
    }
}