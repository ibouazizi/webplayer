# SWAP WebRTC Sender Application

This is a web-based application for streaming media to MPEG-I Scene Description viewers using the 3GPP SWAP protocol.

## Quick Start

### Windows
Double-click `start.bat` or run:
```bash
npx serve . -p 8080 --cors
```

### Linux/Mac
Run:
```bash
./start.sh
# or
npx serve . -p 8080 --cors
```

### Python Alternative
```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

## Usage

1. **Server URL**: Keep the default `wss://bouazizi.dev:8443`
2. **Connection Criteria**: Use `siggraph2025` to connect with viewers
3. **Select Media**:
   - Choose camera from dropdown
   - Choose microphone from dropdown
   - Or select "Screen Share" for screen capture
4. **Start Streaming**: Click the blue "Start Streaming" button
5. **Monitor**: Watch viewer count and streaming statistics

## Features

- **Media Sources**: Camera, microphone, and screen capture
- **Resolution Options**: 480p, 720p, and 1080p
- **Real-time Stats**: Bitrate, FPS, latency monitoring
- **Multi-viewer Support**: Stream to multiple viewers simultaneously
- **Auto-reconnection**: Handles network interruptions gracefully

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (limited WebRTC support)

## Troubleshooting

- **No devices listed**: Grant camera/microphone permissions
- **Connection failed**: Check firewall settings for WSS connections
- **Poor quality**: Select lower resolution or check network bandwidth