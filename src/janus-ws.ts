import debugModule from 'debug';
import { EventEmitter } from 'events';
import uuid from 'uuid/v4';
import {
    IJanusWsBaseMessage,
    IJanusWsErrorMessage,
    IJanusWsEventMessage,
    IJanusWsHangupMessage,
    IJanusWsMediaMessage,
    IJanusWsSlowlinkMessage,
    IJanusWsSuccessMessage,
    IJanusWsTransactionPayload,
    JanusTransactionReplyType,
    JanusTransactionType,
} from './message-types';
import { JanusWsConfig } from './janus-ws-config';
import {
    IAttachPayload,
    IJanusWsPlugin,
    IDetachPayload,
} from './janus-ws-plugin';

const debug = debugModule('janus-ws');

const ignoredErrorCodes = [
    458, // JANUS_ERROR_SESSION_NOT_FOUND
    459, // JANUS_ERROR_HANDLE_NOT_FOUND
];

export interface IJanusMessageRequest {
    janus: string;
    session_id?: number;
    transaction: string;
}

export interface IJanusTransaction {
    resolve: <T extends IJanusWsBaseMessage>(value: T) => void;
    reject: (error: Error) => void;
    replyType: string;
    request?: IJanusMessageRequest;
}

export class JanusWs<
    TSocket extends WebSocket = WebSocket
> extends EventEmitter {
    private socket?: TSocket;
    private adapter: any;
    private url: string;
    private reconnect: boolean = false;
    private isConnecting: boolean = false;
    private connectionTries: number = 0;
    private connectionTimer?: NodeJS.Timeout;
    private keepAliveTimer?: NodeJS.Timeout;
    private messagesQueue: any[] = [];
    private reconnectTimer?: NodeJS.Timeout;
    private config: JanusWsConfig;
    private transactions: Map<string, IJanusTransaction> = new Map<
        string,
        IJanusTransaction
    >();
    private sessionId?: number;
    private sessionEstablished: boolean = false;
    private pluginHandles: Map<number, IJanusWsPlugin<TSocket>> = new Map<
        number,
        IJanusWsPlugin<TSocket>
    >();

    constructor(config: JanusWsConfig) {
        super();
        const { adapter, url, reconnect } = config;

        this.adapter = adapter;
        this.url = url;
        this.reconnect = reconnect;
        this.config = config;

        (window as any).dropJanus = () => {
            this.disconnect();
            this.onDrop();
        };
    }

    reset() {
        if (this.socket) {
            this.disconnect();
        }
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
        }
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
        }
        this.socket = undefined;
        this.connectionTries = 0;
        this.sessionId = undefined;
        this.sessionEstablished = false;
        this.isConnecting = false;
    }

    connect() {
        this.connectionTries += 1;
        this.sessionId = undefined;
        this.sessionEstablished = false;
        this.isConnecting = true;
        this.socket = new this.adapter(this.url, 'janus-protocol');

        this.runConnectionTimeout();
        this.registerEventListeners();
    }

    disconnect() {
        if (!this.socket) {
            return;
        }
        this.socket.close();
        this.unRegisterEventListeners();
    }

    off(event: string | symbol, listener: (...args: any[]) => void) {
        this.removeListener(event, listener);
        return this;
    }

    on(event: string | symbol, listener: (...args: any[]) => void) {
        super.on(event, listener);

        if (event === 'open' && this.isConnected()) {
            setTimeout(() => listener());
        }

        return this;
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    isSessionEstablished() {
        return this.isConnected() && this.sessionEstablished;
    }

    getSessionId() {
        return this.sessionId;
    }

    sendMessage<T extends IJanusMessageRequest = IJanusMessageRequest>(
        request: T
    ) {
        if (this.socket && this.isConnected()) {
            this.socket.send(JSON.stringify(request));
        } else {
            this.messagesQueue.push(request);
        }
    }

    async addPlugin<T extends IJanusWsPlugin<TSocket>>(plugin: T) {
        const request = plugin.getAttachPayload();
        const json = await this.transaction<
            IJanusWsSuccessMessage,
            IAttachPayload
        >('attach', 'success', request);

        if (json.janus !== 'success') {
            debug('Cannot add plugin', json);
            if (typeof plugin.error === 'function') {
                plugin.error(JSON.stringify(json));
            }
            throw new Error(JSON.stringify(json));
        }

        this.pluginHandles.set(json.data.id, plugin);

        return plugin.success(this, json.data.id);
    }

    async removePlugin<T extends IJanusWsPlugin<TSocket>>(plugin: T) {
        const json = await this.transaction<
            IJanusWsSuccessMessage,
            IDetachPayload
        >('detach', 'success', {
            ...plugin.getAttachPayload(),
            handle_id: plugin.getHandleId(),
        });

        if (json.janus !== 'success') {
            debug('Cannot detach plugin', json);
            if (typeof plugin.error === 'function') {
                plugin.error(JSON.stringify(json));
            }
            throw new Error(JSON.stringify(json));
        }

        plugin.detach();
    }

    async transaction<
        T extends IJanusWsBaseMessage = IJanusWsBaseMessage,
        P extends IJanusWsTransactionPayload = {}
    >(
        type: JanusTransactionType,
        replyType: JanusTransactionReplyType = 'ack',
        payload?: P,
        timeout?: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const transactionId = uuid();
            if (timeout) {
                setTimeout(() => {
                    reject(
                        new Error(`Transaction timed out after ${timeout}ms`)
                    );
                }, timeout);
            }

            if (!this.isConnected()) {
                reject(new Error('Janus is not connected.'));
                return;
            }

            const request = {
                janus: type,
                session_id:
                    (payload && Number(payload.session_id)) || this.sessionId,
                transaction: transactionId,
                ...(payload && { ...payload }),
            };
            this.transactions.set(transactionId, {
                resolve: resolve as any,
                reject,
                replyType,
                request: type !== 'create' ? request : undefined,
            });

            this.sendMessage(request);
        });
    }

    private async keepAlive(isScheduled?: boolean) {
        if (
            !this.socket ||
            !this.isConnected() ||
            !this.isSessionEstablished()
        ) {
            return;
        }

        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
        }

        if (isScheduled) {
            this.keepAliveTimer = setTimeout(() => {
                this.keepAlive();
            }, this.config.keepAliveInterval);
        } else {
            debug('send keepAlive', this.sessionId);
            try {
                await this.transaction(
                    'keepalive',
                    undefined,
                    undefined,
                    this.config.keepAliveTimeout
                );
                debug('keepAlive');
                this.keepAliveTimer = setTimeout(() => {
                    this.keepAlive();
                }, this.config.keepAliveInterval);
            } catch (err) {
                debug('keepAlive error');
                this.disconnect();
                this.onDrop();
            }
        }
    }

    private runConnectionTimeout() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
        }
        this.connectionTimer = setTimeout(() => {
            if (
                (!this.config.createSessionOnConnect &&
                    this.socket!.readyState !== WebSocket.OPEN) ||
                (this.config.createSessionOnConnect && !this.sessionId)
            ) {
                debug(
                    'Connection attempt timed out after %ims',
                    this.config.connectionTimeout
                );
                this.isConnecting = false;
                this.disconnect();
                this.onDrop();
            }
        }, this.config.connectionTimeout);
    }

    private registerEventListeners() {
        this.socket!.addEventListener('open', this.onOpen);
        this.socket!.addEventListener('close', this.onDrop);
        this.socket!.addEventListener('error', this.onDrop);
        this.socket!.addEventListener('message', this.onMessage);
    }

    private unRegisterEventListeners() {
        this.socket!.removeEventListener('open', this.onOpen);
        this.socket!.removeEventListener('close', this.onDrop);
        this.socket!.removeEventListener('error', this.onDrop);
        this.socket!.removeEventListener('message', this.onMessage);
    }

    private onOpenRunMessageQueue = () => {
        while (this.messagesQueue.length) {
            const messageToSend = this.messagesQueue.shift();
            this.sendMessage(messageToSend);
        }
    };

    private onOpen = () => {
        if (!this.config.createSessionOnConnect) {
            this.keepAlive(true);
            this.isConnecting = false;
            this.emit('open');
            this.onOpenRunMessageQueue();
            return;
        }

        // this.transaction('create', 'success');
        const transactionId = uuid();
        this.transactions.set(transactionId, {
            resolve: json => {
                if (json.janus !== 'success') {
                    debug('Cannot connect to Janus', json);
                    this.onDrop();
                    return;
                }

                const message = json as IJanusWsSuccessMessage;

                this.sessionId = message.data.id;
                this.sessionEstablished = true;

                this.keepAlive(true);

                debug('Janus connected, sessionId %s', this.sessionId);
                this.isConnecting = false;
                this.emit('open');
                this.onOpenRunMessageQueue();
            },
            reject: () => {
                throw new Error('Init transaction failed?');
            },
            replyType: 'success',
        });

        this.sendMessage({
            janus: 'create',
            transaction: transactionId,
        });
    };

    private onDrop = (...args: any[]) => {
        debug('DROPPED', ...args);
        this.emit('close', args);

        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
        }

        if (!this.reconnect) {
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(this.handleReconnect, 5000);
        this.handleReconnect();
    };

    private handleReconnect = () => {
        if (
            this.config.connectionTriesLimit &&
            this.connectionTries > this.config.connectionTriesLimit
        ) {
            this.connectionTries = 0;
            if (this.connectionTimer) {
                clearTimeout(this.connectionTimer);
            }
            debug('Reached maximum Janus connection tries!');
            this.emit('connectError');
            return;
        }
        if (
            this.isConnecting ||
            (this.config.createSessionOnConnect &&
                this.isSessionEstablished()) ||
            (!this.config.createSessionOnConnect && this.isConnected())
        ) {
            return;
        }
        debug('ATTEMPT RECONNECT');
        this.reset();
        this.connect();
    };

    private onMessage = (event: MessageEvent) => {
        try {
            const message: IJanusWsBaseMessage = JSON.parse(event.data);
            const { janus, ...data } = message;
            const transactionId = data.transaction;

            switch (janus) {
                case 'timeout': {
                    if (data.session_id !== this.sessionId) {
                        debug('Got timeout from another websocket!');
                        return;
                    }
                    this.emit('timeout');
                    break;
                }
                case 'ack': {
                    const transaction = this.getTransaction(
                        data.transaction,
                        janus
                    );
                    if (transaction && transaction.resolve) {
                        this.resolveTransaction(transactionId, message);
                    }
                    break;
                }
                case 'success': {
                    const {
                        // tslint:disable-next-line no-shadowed-variable
                        janus,
                        // tslint:disable-next-line no-shadowed-variable
                        ...data
                    } = message as IJanusWsSuccessMessage;
                    const transaction = this.getTransaction(
                        data.transaction,
                        janus
                    );
                    if (!transaction) {
                        return;
                    }

                    const pluginData = data.plugindata;
                    if (!pluginData) {
                        this.resolveTransaction(transactionId, message);
                        return;
                    }

                    const sender = data.sender;
                    if (!sender) {
                        this.resolveTransaction(transactionId, message);
                        debug('Missing sender for pluginData', message);
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }

                    this.resolveTransaction<any>(transactionId, {
                        data: pluginData.data,
                        json: message,
                    });
                    break;
                }
                case 'webrtcup': {
                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }
                    pluginHandle.webrtcState(true);
                    break;
                }
                case 'hangup': {
                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }
                    const { reason } = message as IJanusWsHangupMessage;
                    pluginHandle.webrtcState(false, reason);
                    break;
                }
                case 'detached': {
                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }
                    // TODO: Missing implementation? Check official Janus.js for reference
                    break;
                }
                case 'media': {
                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }
                    const { type, receiving } = message as IJanusWsMediaMessage;
                    pluginHandle.mediaState(type, receiving);
                    break;
                }
                case 'slowlink': {
                    const {
                        uplink,
                        nacks,
                    } = message as IJanusWsSlowlinkMessage;
                    debug(
                        'Got a slowlink event on session %i (NACKs: %i)',
                        this.sessionId,
                        nacks
                    );

                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }
                    pluginHandle.slowLink(uplink, nacks);
                    break;
                }
                case 'error': {
                    const { error } = message as IJanusWsErrorMessage;
                    if (
                        error &&
                        error.code &&
                        !ignoredErrorCodes.includes(error.code)
                    ) {
                        debug('Janus error response', message);
                    }

                    const transaction = this.getTransaction(
                        message.transaction
                    );
                    if (transaction && transaction.reject) {
                        if (transaction.request) {
                            console.debug(
                                'Janus Error: rejecting transaction',
                                transaction.request,
                                message
                            );
                        }
                        transaction.reject(new Error(JSON.stringify(message)));
                    }
                    break;
                }
                case 'event': {
                    const sender = data.sender;
                    if (!sender) {
                        debug('Missing sender...');
                        return;
                    }

                    const {
                        plugindata,
                        error_code,
                    } = message as IJanusWsEventMessage<any>;

                    if (!plugindata) {
                        debug('Missing pluginData...');
                        return;
                    }

                    const pluginHandle = this.pluginHandles.get(sender);
                    if (!pluginHandle) {
                        debug(
                            'This handle is not attached to this session',
                            message
                        );
                        return;
                    }

                    const pluginDataData = plugindata.data;
                    const transaction = this.getTransaction(data.transaction);
                    if (transaction) {
                        if (error_code) {
                            transaction.reject(
                                new Error(JSON.stringify(message))
                            );
                            return;
                        }
                        transaction.resolve(message);
                        return;
                    }

                    pluginHandle.onmessage(pluginDataData, message);
                    break;
                }
                default:
                    this.emit(janus, data);
                    break;
            }
        } catch (err) {}
    };

    private getTransaction(
        transactionId: string,
        replyType?: JanusTransactionReplyType
    ) {
        const transaction = this.transactions.get(transactionId);

        if (
            !transaction ||
            (transaction && replyType && transaction.replyType !== replyType)
        ) {
            return null;
        }

        return transaction;
    }

    private resolveTransaction<
        T extends IJanusWsBaseMessage = IJanusWsBaseMessage
    >(transactionId: string, payload: T) {
        const transaction = this.transactions.get(transactionId);
        if (transaction && transaction.resolve) {
            transaction.resolve(payload);
        }
        this.transactions.delete(transactionId);
    }
}
