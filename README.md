# MPEG-I Scene Description WebPlayer with WebRTC/SWAP Support

This project implements a comprehensive MPEG-I Scene Description (ISO/IEC 23090-14:2024) compliant web player using THREE.js, with added support for WebRTC streaming via the 3GPP TS 26.113 SWAP protocol.

Original implementation by Isaac Nealey 2023 - contact: inealey@ucsd.edu  
WebRTC/SWAP extension and MPEG-I compliance enhancements by 2025

## Overview

This implementation provides a complete Media Access Function (MAF) architecture as specified in MPEG-I Scene Description, including:
- Circular buffer management for timed media access
- Thread-safe SharedArrayBuffer implementation
- WebWorker-based media processing pipelines
- Support for both file-based (DASH) and real-time (WebRTC) media sources

## MPEG-I Scene Description Compliance

### Media Access Function (MAF) Architecture

The implementation follows the MPEG-I Scene Description specification for media access:

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│                    (THREE.js Renderer)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│               Media Access Function (MAF)                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  MPEG Extensions                        │ │
│  │  • MPEG_media      • MPEG_texture_video               │ │
│  │  • MPEG_buffer_circular  • MPEG_audio_spatial         │ │
│  │  • MPEG_accessor_timed                                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Buffer Management Layer                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Circular Buffer System                     │ │
│  │  • SharedArrayBuffer-based ring buffers                │ │
│  │  • Thread-safe read/write with Atomics                 │ │
│  │  • Frame-based access with timestamps                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Media Pipeline Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  DASH Pipeline  │  │ WebRTC Pipeline │                  │
│  │  (File-based)   │  │  (Real-time)    │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Circular Buffer Implementation

The circular buffer system implements the MPEG-I specification for timed media access:

#### 1. **MPEG_buffer_circular Extension**
Located in `src/js/three-gltf-extensions/EXT_MPEG_buffer_circular.js`

```javascript
// Allocates SharedArrayBuffer for cross-thread access
const bufferDef = {
    byteLength: frameSize * frameCount,
    extensions: {
        MPEG_buffer_circular: {
            media: 0,      // Media index reference
            count: 10,     // Number of frames in circular buffer
            tracks: [0]    // Track selection
        }
    }
};
```

#### 2. **Buffer Management System**
Located in `src/js/three-gltf-extensions/utils/buffer_manager.js`

Key features:
- **Singleton Pattern**: Centralized buffer management
- **Ring Buffer**: Uses `ringbuf.js` for thread-safe circular buffers
- **SharedArrayBuffer**: Enables zero-copy data sharing between threads
- **Producer-Consumer Pattern**: Supports multiple consumers per buffer

```javascript
// Create a circular buffer for video frames
const buffer = bufferManager.createBuffer(
    'video-0',          // Unique buffer ID
    1280,               // Width
    720,                // Height
    4,                  // RGBA channels
    10,                 // Max frames
    Uint8Array          // Data type
);
```

#### 3. **Thread-Safe Operations**
The implementation uses `Atomics` for thread-safe buffer operations:

```javascript
// In CircularBuffer.js
class CircularBuffer {
    // Atomic read/write indices
    get read_idx() {
        return Atomics.load(new Int32Array(this.#indexBuffer), 0);
    }
    
    // Thread-safe frame write with notification
    writeFrame(frameData) {
        // ... write data ...
        Atomics.store(new Int32Array(this.#indexBuffer), 1, nextWriteIdx);
        Atomics.notify(new Int32Array(this.#indexBuffer), 1, 1);
    }
}
```

### Media Pipeline Architecture

#### 1. **Base Pipeline Class**
All media pipelines extend the base `MediaPipeline` class:

```javascript
class MediaPipeline extends EventEmitter {
    // Common interface for all media sources
    async initialize(config) { }
    async play() { }
    pause() { }
    stop() { }
    connectVideoTexture(textureExtension, sourceId) { }
    connectAudioSource(audioExtension, sourceId) { }
}
```

#### 2. **DASH Pipeline** (File-based Media)
- Uses `dash.js` for adaptive streaming
- Decodes frames in WebWorker
- Writes to circular buffer

#### 3. **WebRTC Pipeline** (Real-time Media)
- Implements 3GPP SWAP protocol
- Direct frame capture from MediaStream
- Minimal latency path to circular buffer

### MPEG_texture_video Implementation

The texture video extension demonstrates the complete MAF flow:

```javascript
// 1. Allocate circular buffer via MPEG_buffer_circular
const bufferId = `video-${textureIndex}`;
const circularBuffer = bufferManager.createBuffer(
    bufferId,
    extensionDef.width,
    extensionDef.height,
    4,  // RGBA
    3,  // Triple buffering
    Uint8Array
);

// 2. Create WebWorker for media processing
texture.worker = new VideoWorker();
texture.worker.postMessage({
    command: 'initialize',
    sab: circularBuffer.buf,  // SharedArrayBuffer
    uri: mediaPath + mediaDef.uri,
    // ... other parameters
});

// 3. Update texture from circular buffer in render loop
texture.update = function() {
    const availableData = this.bufferCircular.available_read();
    if (availableData >= this.frameSize) {
        const frameData = new Uint8Array(this.frameSize);
        const bytesRead = this.bufferCircular.pop(frameData);
        if (bytesRead === this.frameSize) {
            this.image.data.set(frameData);
            this.needsUpdate = true;
        }
    }
};
```

### Spatial Audio Integration

The `MPEG_audio_spatial` extension integrates with WebAudio API:

```javascript
class GLTFMPEGAudioSpatialExtension {
    constructor(parser) {
        this.audioContext = new AudioContext();
        this.sources = new Map();
        this.listener = null;
    }
    
    // Updates audio source positions based on scene graph
    update(scene, camera) {
        // Update listener position from camera
        const listener = this.audioContext.listener;
        listener.positionX.value = camera.position.x;
        listener.positionY.value = camera.position.y;
        listener.positionZ.value = camera.position.z;
        
        // Update source positions from scene nodes
        scene.traverse(node => {
            if (node.userData.audioSourceId !== undefined) {
                const source = this.sources.get(node.userData.audioSourceId);
                if (source && source.panner) {
                    const worldPos = node.getWorldPosition(new THREE.Vector3());
                    source.panner.positionX.value = worldPos.x;
                    source.panner.positionY.value = worldPos.y;
                    source.panner.positionZ.value = worldPos.z;
                }
            }
        });
    }
}
```

## Installation and Usage

### Prerequisites
- Node.js/npm
- Modern browser with SharedArrayBuffer support
- HTTPS or localhost (required for SharedArrayBuffer)

### Viewer Application

1. **Install dependencies**
```bash
npm install
```

2. **Start development server**
```bash
npm run dev
```

3. **Access the viewer**
```
http://localhost:5173
```

### WebRTC Sender Application

1. **Navigate to sender directory**
```bash
cd sender-app
```

2. **Start sender server**
```bash
npm install
npm start
```

3. **Configure streaming**
- Server URL: `wss://bouazizi.dev:8443`
- Criteria: `siggraph2025`
- Select camera/microphone
- Click "Start Streaming"

### Scene Selection

The viewer supports multiple scenes:
- **DASH Scene**: `?scene=dash` (default)
- **WebRTC Scene**: `?scene=webrtc`

## Production Deployment with Nginx

### Hosting on Nginx Server

To deploy both the sender and receiver applications on an nginx server with proper HTTPS and CORS headers:

#### 1. Build the Viewer Application

```bash
# In the project root directory
npm run build
# This creates a dist/ directory with production files
```

#### 2. Nginx Configuration

Create an nginx configuration file `/etc/nginx/sites-available/mpeg-webplayer`:

```nginx
# MPEG-I WebPlayer Nginx Configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com;  # Replace with your domain

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Root directory for viewer application
    root /var/www/mpeg-webplayer/viewer;
    index index.html;

    # CORS and SharedArrayBuffer headers (required for MPEG-I)
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Viewer application (main path)
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            
            # Maintain CORS headers for assets
            add_header Cross-Origin-Embedder-Policy "require-corp" always;
            add_header Cross-Origin-Opener-Policy "same-origin" always;
        }
    }

    # Sender application (subpath)
    location /sender/ {
        alias /var/www/mpeg-webplayer/sender/;
        try_files $uri $uri/ /sender/index.html;
        
        # Same CORS headers for sender
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "cross-origin" always;
    }

    # WebAssembly MIME type
    location ~ \.wasm$ {
        add_header Content-Type "application/wasm";
        
        # CORS headers for WASM
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json application/wasm;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### 3. Directory Structure

Set up the following directory structure:

```bash
/var/www/mpeg-webplayer/
├── viewer/              # Built viewer application files
│   ├── index.html
│   ├── assets/         # JS, CSS files from build
│   ├── gltf/           # GLTF scene files
│   ├── images/         # Images and textures
│   └── js/             # Additional JS files (opencv.js, etc.)
└── sender/             # Sender application files
    ├── index.html
    ├── index-threaded.html
    ├── sender.js
    ├── sender-threaded.js
    ├── stats-worker.js
    └── swap-3gpp-client.js
```

#### 4. Deployment Steps

```bash
# 1. Create directories
sudo mkdir -p /var/www/mpeg-webplayer/{viewer,sender}

# 2. Copy built viewer files
sudo cp -r dist/* /var/www/mpeg-webplayer/viewer/

# 3. Copy public assets (gltf, images, etc.)
sudo cp -r public/* /var/www/mpeg-webplayer/viewer/

# 4. Copy sender application
sudo cp -r sender-app/* /var/www/mpeg-webplayer/sender/

# 5. Set proper permissions
sudo chown -R www-data:www-data /var/www/mpeg-webplayer
sudo chmod -R 755 /var/www/mpeg-webplayer

# 6. Enable the site
sudo ln -s /etc/nginx/sites-available/mpeg-webplayer /etc/nginx/sites-enabled/

# 7. Test nginx configuration
sudo nginx -t

# 8. Reload nginx
sudo systemctl reload nginx
```

#### 5. SSL Certificate Setup (using Let's Encrypt)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

#### 6. Accessing the Applications

After deployment:
- **Viewer**: `https://your-domain.com/`
- **Sender**: `https://your-domain.com/sender/`

### Alternative: Docker Deployment

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM node:18-alpine AS builder

# Build viewer application
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built viewer application
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/public /usr/share/nginx/html

# Copy sender application
COPY sender-app /usr/share/nginx/html/sender

# Expose port
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

And `nginx.conf` for Docker:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # CORS headers for SharedArrayBuffer
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /sender/ {
        try_files $uri $uri/ /sender/index.html;
    }

    location ~ \.wasm$ {
        add_header Content-Type "application/wasm";
    }

    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/wasm;
}
```

Run with Docker:

```bash
# Build image
docker build -t mpeg-webplayer .

# Run container
docker run -d -p 80:80 -p 443:443 mpeg-webplayer
```

### Important Notes

1. **HTTPS Required**: SharedArrayBuffer requires a secure context (HTTPS or localhost)
2. **CORS Headers**: The specific CORS headers are mandatory for SharedArrayBuffer support
3. **Browser Compatibility**: Ensure users have browsers that support SharedArrayBuffer
4. **Performance**: Enable HTTP/2 and gzip for better performance
5. **Security**: Always use HTTPS in production for WebRTC

## Technical Details

### Cross-Origin Isolation

Required for SharedArrayBuffer support:

```javascript
// vite.config.js
export default {
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin'
        }
    }
}
```

### Performance Optimizations

1. **Zero-Copy Architecture**: SharedArrayBuffer eliminates memory copies
2. **WebWorker Processing**: Media decoding off main thread
3. **Frame Skipping**: Prevents blocking during high load
4. **Pre-allocated Buffers**: Reduces garbage collection
5. **Atomic Operations**: Lock-free thread synchronization

### Browser Requirements

- Chrome 92+ or Firefox 90+
- SharedArrayBuffer support
- WebRTC support
- WebAudio API support

## Extension Specifications

This implementation follows these MPEG-I Scene Description extensions:

- **MPEG_media**: Media source definition and alternatives
- **MPEG_buffer_circular**: Circular buffer allocation for timed media
- **MPEG_accessor_timed**: Time-indexed access to buffer data
- **MPEG_texture_video**: Video texture mapping with buffer source
- **MPEG_audio_spatial**: 3D spatial audio with WebAudio

## Contributing

When contributing, ensure:
1. Maintain MPEG-I specification compliance
2. Preserve thread-safety in buffer operations
3. Test with both DASH and WebRTC sources
4. Document any deviations from specifications

## License

[License information]

## Acknowledgments

- Original MPEG extensions implementation by Isaac Nealey
- MPEG-I Scene Description working group
- THREE.js community
- dash.js and ringbuf.js projects