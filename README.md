# WebPlayer

Three.js MPEG extensions for glTF with DASH streaming support. This project enables streaming video textures in glTF models using DASH.

## Features

- MPEG-DASH streaming support for video textures
- glTF extensions for video and audio streaming
- Real-time video texture updates
- VR/XR support
- Debug visualization tools
- Spatial audio support

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build:prod
```

## Project Structure

```
webplayer/
├── src/                    # Source files
│   ├── css/               # Stylesheets
│   └── js/                # JavaScript files
│       ├── main.js        # Entry point
│       └── three-gltf-extensions/  # glTF extensions
│           ├── EXT_MPEG_media.js           # Media pipeline management
│           ├── EXT_MPEG_buffer_circular.js # Circular buffer for streaming
│           ├── EXT_MPEG_texture_video.js   # Video texture handling
│           └── EXT_MPEG_audio_spatial.js   # Spatial audio support
├── public/                 # Static assets
│   ├── images/            # Image assets
│   └── gltf/              # glTF models and textures
├── dist/                   # Build output
└── node_modules/          # Dependencies

```

## glTF Extensions

### MPEG_media
Handles media streaming setup and pipeline management. Supports:
- DASH streaming configuration
- Media pipeline creation
- Stream synchronization

### MPEG_buffer_circular
Manages circular buffers for efficient streaming:
- Lock-free buffer implementation
- Shared memory for worker communication
- Automatic buffer size management

### MPEG_texture_video
Handles video textures in glTF models:
- Real-time texture updates
- Frame synchronization
- Debug visualization
- Memory-efficient frame handling

### MPEG_audio_spatial
Provides spatial audio support:
- 3D audio positioning
- Distance-based attenuation
- Audio source management

## Development

### Environment Setup

The project includes two environment configurations:

1. Development (.env.development):
```env
NODE_ENV=development
VITE_DROP_CONSOLE=false
VITE_SOURCEMAP=true
VITE_PORT=3000
```

2. Production (.env.production):
```env
NODE_ENV=production
VITE_DROP_CONSOLE=true
VITE_SOURCEMAP=false
VITE_COMPRESSION=true
```

### Available Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for development
- `npm run build:prod`: Build for production with optimizations
- `npm run preview`: Preview production build
- `npm run clean`: Clean build output

### Build Features

- Code splitting and chunking
- Production optimizations:
  - Minification
  - Tree shaking
  - Compression (gzip, brotli)
- Legacy browser support
- Source maps
- Environment-specific configurations

## Recent Updates

### Video Texture Improvements
- Fixed buffer handling in worker and main thread
- Added chunked data transfer to prevent memory issues
- Improved texture update synchronization
- Added proper error handling
- Enhanced debug texture visualization

### Asset Management
- Added TV model with video texture support
- Added test scene with environment textures
- Configured Git LFS for large file handling
- Organized assets in public directory

### Build System
- Updated package.json with new scripts and dependencies
- Added Vite configuration with production optimizations
- Created environment-specific configurations
- Improved build artifact management

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Legacy browser support via @vitejs/plugin-legacy
- WebGL 2.0 support required
- SharedArrayBuffer support required

## License

MIT
