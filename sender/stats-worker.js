/**
 * Web Worker for stats monitoring
 * Offloads stats collection and aggregation from main thread
 */

let connections = new Map();
let previousStats = new Map();
let monitoringInterval = null;

self.addEventListener('message', async (event) => {
    const { command, data } = event.data;
    
    switch (command) {
        case 'init':
            startMonitoring(data.interval || 1000);
            break;
            
        case 'addConnection':
            connections.set(data.id, data.pc);
            break;
            
        case 'removeConnection':
            connections.delete(data.id);
            previousStats.delete(data.id);
            break;
            
        case 'stop':
            stopMonitoring();
            break;
    }
});

function startMonitoring(interval) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    monitoringInterval = setInterval(async () => {
        const stats = await collectStats();
        self.postMessage({ type: 'stats', data: stats });
    }, interval);
}

function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    connections.clear();
    previousStats.clear();
}

async function collectStats() {
    if (connections.size === 0) {
        return { bitrate: 0, fps: 0, latency: 0, viewerCount: 0 };
    }
    
    let totalBitrate = 0;
    let avgFps = 0;
    let avgLatency = 0;
    let validConnections = 0;
    
    // Collect stats in parallel
    const statsPromises = Array.from(connections.entries()).map(async ([id, pc]) => {
        try {
            const stats = await pc.getStats();
            return { id, stats };
        } catch (error) {
            console.error(`Failed to get stats for ${id}:`, error);
            return null;
        }
    });
    
    const results = await Promise.all(statsPromises);
    
    for (const result of results) {
        if (!result) continue;
        
        const { id, stats } = result;
        let connectionBitrate = 0;
        let connectionFps = 0;
        let connectionLatency = 0;
        
        stats.forEach(report => {
            if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                // Get or create previous stats
                let prevStats = previousStats.get(id);
                if (!prevStats) {
                    prevStats = { timestamp: 0, bytesSent: 0 };
                    previousStats.set(id, prevStats);
                }
                
                // Calculate bitrate
                const now = Date.now();
                const timeDiff = now - prevStats.timestamp;
                
                if (timeDiff > 0 && prevStats.bytesSent > 0) {
                    const bytesDiff = report.bytesSent - prevStats.bytesSent;
                    connectionBitrate = Math.round((bytesDiff * 8) / timeDiff);
                }
                
                prevStats.timestamp = now;
                prevStats.bytesSent = report.bytesSent;
                
                connectionFps = report.framesPerSecond || 0;
            }
            
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                connectionLatency = Math.round(report.currentRoundTripTime * 1000);
            }
        });
        
        if (connectionBitrate > 0 || connectionFps > 0) {
            totalBitrate += connectionBitrate;
            avgFps += connectionFps;
            avgLatency += connectionLatency;
            validConnections++;
        }
    }
    
    // Calculate averages
    if (validConnections > 0) {
        avgFps = avgFps / validConnections;
        avgLatency = avgLatency / validConnections;
    }
    
    return {
        bitrate: totalBitrate,
        fps: avgFps,
        latency: avgLatency,
        viewerCount: connections.size
    };
}