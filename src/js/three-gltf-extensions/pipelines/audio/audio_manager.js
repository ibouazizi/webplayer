let audioContext = null;

export function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
    return audioContext;
}

export function getAudioContext() {
    return audioContext;
}