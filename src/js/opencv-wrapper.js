// Create a global Module object that OpenCV.js expects
window.Module = {
    onRuntimeInitialized: function() {
        console.log('OpenCV.js runtime initialized');
        if (window.onOpenCvReady) {
            window.onOpenCvReady();
        }
    },
    print: function(text) {
        console.log('OpenCV.js:', text);
    },
    printErr: function(text) {
        console.error('OpenCV.js error:', text);
    }
};

// Import OpenCV.js
import '../lib/opencv.js';