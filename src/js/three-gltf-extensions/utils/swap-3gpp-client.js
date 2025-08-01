/**
 * 3GPP TS 26.113 SWAP Client implementation
 * Compliant with the official SWAP protocol specification
 */

// Message types defined in 3GPP TS 26.113
const MessageTypes = {
    REGISTER: 'register',
    RESPONSE: 'response',
    CONNECT: 'connect',
    ACCEPT: 'accept',
    REJECT: 'reject',
    UPDATE: 'update',
    CLOSE: 'close',
    APPLICATION: 'application'
};

// Error types
const ErrorTypes = {
    MESSAGE_UNKNOWN: 'message_unknown',
    MESSAGE_MALFORMATTED: 'message_malformatted',
    TARGET_UNKNOWN: 'target_unknown',
    UNAUTHORIZED: 'unauthorized'
};

export class Swap3GPPClient extends EventTarget {
    constructor(serverUrl) {
        super();
        // Ensure proper SWAP endpoint
        if (!serverUrl.includes('/3gpp-swap/v1/')) {
            // Remove any trailing slash
            serverUrl = serverUrl.replace(/\/$/, '');
            serverUrl = serverUrl + '/3gpp-swap/v1/';
        }
        this.serverUrl = serverUrl;
        this.websocket = null;
        this.isConnected = false;
        this.source = this.generateSource();
        this.messageId = 0;
        this.pendingMessages = new Map(); // messageId -> {resolve, reject, timeout}
        this.role = null;
        this.criteria = [];
        this.sessions = new Map(); // source -> session info
    }

    /**
     * Generate a unique source identifier
     * Must be at least 10 characters per spec
     */
    generateSource() {
        return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get next message ID
     */
    getNextMessageId() {
        return this.messageId++;
    }

    /**
     * Connect to SWAP server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting to 3GPP SWAP server:', this.serverUrl);
            
            try {
                // Use the required subprotocol
                this.websocket = new WebSocket(this.serverUrl, ['3gpp.SWAP.v1']);
                
                this.websocket.onopen = () => {
                    console.log('Connected to SWAP server');
                    this.isConnected = true;
                    this.dispatchEvent(new Event('connected'));
                    resolve();
                };
                
                this.websocket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                    }
                };
                
                this.websocket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.dispatchEvent(new CustomEvent('error', { detail: error }));
                    if (!this.isConnected) {
                        reject(error);
                    }
                };
                
                this.websocket.onclose = () => {
                    console.log('Disconnected from SWAP server');
                    this.isConnected = false;
                    this.dispatchEvent(new Event('disconnected'));
                    
                    // Reject all pending messages
                    for (const [messageId, pending] of this.pendingMessages) {
                        clearTimeout(pending.timeout);
                        pending.reject(new Error('Connection closed'));
                    }
                    this.pendingMessages.clear();
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send SWAP message and wait for response
     */
    async sendMessage(message, waitForResponse = true) {
        if (!this.isConnected || !this.websocket) {
            throw new Error('Not connected to SWAP server');
        }
        
        // Add message ID
        message.message_id = this.getNextMessageId();
        
        // Send message
        this.websocket.send(JSON.stringify(message));
        console.log(`Sent ${message.message_type} message:`, message);
        
        if (!waitForResponse) {
            return;
        }
        
        // Wait for response
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingMessages.delete(message.message_id);
                reject(new Error('Response timeout'));
            }, 30000); // 30 second timeout
            
            this.pendingMessages.set(message.message_id, {
                resolve,
                reject,
                timeout
            });
        });
    }

    /**
     * Register with SWAP server
     * @param {string} role - 'sender' or 'receiver'
     * @param {string} criteriaValue - Simple string criteria (e.g., 'siggraph2025')
     */
    async register(role, criteriaValue) {
        this.role = role;
        
        // Convert simple string to SWAP criteria format
        this.criteria = [{
            type: 'token',
            value: criteriaValue
        }];
        
        const message = {
            version: "1",
            source: this.source,
            message_type: MessageTypes.REGISTER,
            criteria: this.criteria
        };
        
        const response = await this.sendMessage(message);
        
        if (response.status_code === 200) {
            console.log('Successfully registered with SWAP server');
            this.dispatchEvent(new Event('registered'));
            
            // For senders, wait for receivers to connect
            if (role === 'sender') {
                console.log('Waiting for receivers to connect...');
            }
        } else {
            throw new Error(`Registration failed: ${response.reason_phrase}`);
        }
    }

    /**
     * Connect to another endpoint (for receivers)
     * @param {string} criteriaValue - Criteria to match
     * @param {RTCSessionDescription} offer - WebRTC offer
     */
    async connectToSender(criteriaValue, offer) {
        const message = {
            version: "1",
            source: this.source,
            message_type: MessageTypes.CONNECT,
            criteria: [{
                type: 'token',
                value: criteriaValue
            }],
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        };
        
        const response = await this.sendMessage(message);
        
        if (response.status_code === 200) {
            console.log('Connect request sent successfully');
        } else {
            throw new Error(`Connect failed: ${response.reason_phrase}`);
        }
    }

    /**
     * Accept incoming connection (for senders)
     * @param {string} target - Target source ID
     * @param {RTCSessionDescription} answer - WebRTC answer
     */
    async acceptConnection(target, answer) {
        const message = {
            version: "1",
            source: this.source,
            target: target,
            message_type: MessageTypes.ACCEPT,
            answer: {
                type: answer.type,
                sdp: answer.sdp
            }
        };
        
        const response = await this.sendMessage(message);
        
        if (response.status_code === 200) {
            console.log('Connection accepted');
            this.sessions.set(target, { state: 'connected' });
        } else {
            throw new Error(`Accept failed: ${response.reason_phrase}`);
        }
    }

    /**
     * Reject incoming connection
     * @param {string} target - Target source ID
     * @param {string} reason - Rejection reason
     */
    async rejectConnection(target, reason = 'User rejected') {
        const message = {
            version: "1",
            source: this.source,
            target: target,
            message_type: MessageTypes.REJECT,
            reason: reason
        };
        
        await this.sendMessage(message);
    }

    /**
     * Send UPDATE message (ICE candidates, renegotiation)
     * @param {string} target - Target source ID
     * @param {Object} update - Update data
     */
    async sendUpdate(target, update) {
        const message = {
            version: "1",
            source: this.source,
            target: target,
            message_type: MessageTypes.UPDATE,
            update: update
        };
        
        await this.sendMessage(message, false); // Don't wait for response
    }

    /**
     * Close connection
     * @param {string} target - Target source ID
     */
    async closeConnection(target) {
        const message = {
            version: "1",
            source: this.source,
            target: target,
            message_type: MessageTypes.CLOSE
        };
        
        await this.sendMessage(message, false);
        this.sessions.delete(target);
    }

    /**
     * Send application-specific message
     * @param {string} target - Target source ID
     * @param {Object} data - Application data
     */
    async sendApplicationMessage(target, data) {
        const message = {
            version: "1",
            source: this.source,
            target: target,
            message_type: MessageTypes.APPLICATION,
            application: data
        };
        
        await this.sendMessage(message, false);
    }

    /**
     * Handle incoming messages
     */
    handleMessage(message) {
        console.log(`Received ${message.message_type} message:`, message);
        
        switch (message.message_type) {
            case MessageTypes.RESPONSE:
                this.handleResponse(message);
                break;
                
            case MessageTypes.CONNECT:
                // Incoming connection request (for senders)
                this.dispatchEvent(new CustomEvent('connect-request', {
                    detail: {
                        source: message.source,
                        offer: message.offer,
                        criteria: message.criteria
                    }
                }));
                break;
                
            case MessageTypes.ACCEPT:
                // Connection accepted (for receivers)
                this.sessions.set(message.source, { state: 'connected' });
                this.dispatchEvent(new CustomEvent('connection-accepted', {
                    detail: {
                        source: message.source,
                        answer: message.answer
                    }
                }));
                break;
                
            case MessageTypes.REJECT:
                // Connection rejected
                this.dispatchEvent(new CustomEvent('connection-rejected', {
                    detail: {
                        source: message.source,
                        reason: message.reason
                    }
                }));
                break;
                
            case MessageTypes.UPDATE:
                // Update message (ICE candidates, etc.)
                this.dispatchEvent(new CustomEvent('update', {
                    detail: {
                        source: message.source,
                        update: message.update
                    }
                }));
                break;
                
            case MessageTypes.CLOSE:
                // Connection closed
                this.sessions.delete(message.source);
                this.dispatchEvent(new CustomEvent('connection-closed', {
                    detail: {
                        source: message.source
                    }
                }));
                break;
                
            case MessageTypes.APPLICATION:
                // Application-specific message
                this.dispatchEvent(new CustomEvent('application-message', {
                    detail: {
                        source: message.source,
                        data: message.application
                    }
                }));
                break;
                
            default:
                console.warn('Unknown message type:', message.message_type);
        }
    }

    /**
     * Handle RESPONSE messages
     */
    handleResponse(message) {
        const pending = this.pendingMessages.get(message.response_to);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingMessages.delete(message.response_to);
            
            if (message.status_code >= 200 && message.status_code < 300) {
                pending.resolve(message);
            } else {
                pending.reject(new Error(`${message.status_code}: ${message.reason_phrase}`));
            }
        }
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.isConnected = false;
        this.sessions.clear();
    }

    /**
     * Get active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
}