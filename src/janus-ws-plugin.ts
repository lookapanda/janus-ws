import debugModule from 'debug';
import { EventEmitter } from 'events';
import uuid from 'uuid/v4';
import {
    IJanusWsBaseMessage,
    IJanusWsTransactionPayload,
    JanusTransactionReplyType,
    JanusTransactionType,
} from './message-types';
import { JanusWs } from './janus-ws';

const debug = debugModule('janus-ws-plugin');

export interface IAttachPayload extends IJanusWsTransactionPayload {
    plugin: string;
    opaque_id: string;
}

export interface IDetachPayload extends IJanusWsTransactionPayload {
    plugin: string;
    opaque_id: string;
    handle_id: string;
}

export interface IJanusWsPlugin<TSocket extends WebSocket = WebSocket> {
    getAttachPayload(): { plugin: string; opaque_id: string };
    getHandleId(): string;
    transaction<
        T extends IJanusWsBaseMessage = IJanusWsBaseMessage,
        P extends IJanusWsTransactionPayload = {}
    >(
        type: JanusTransactionType,
        payload: P,
        replyType?: JanusTransactionReplyType
    ): Promise<T>;
    success(janus: JanusWs<TSocket>, handleId: string): this;
    error?(cause: string): this;
    onmessage<T, M extends IJanusWsBaseMessage = any>(data: T, json: M): void; // TODO: types
    oncleanup?(): void;
    detached?(): void;
    hangup(): void;
    slowLink(uplink: boolean, nacks: number): void;
    mediaState(medium: any, on: any): void;
    webrtcState(isReady: boolean, cause?: string): void;
    detach(): void;
}

export abstract class JanusWsPlugin<TSocket extends WebSocket = WebSocket>
    extends EventEmitter
    implements IJanusWsPlugin<TSocket> {
    protected abstract pluginName: string;
    private id: string;
    private janus?: JanusWs<TSocket>;
    private handleId: string = '';

    constructor() {
        super();
        this.id = uuid();
    }

    getAttachPayload(): IAttachPayload {
        return { plugin: this.pluginName, opaque_id: this.id };
    }

    getHandleId() {
        return this.handleId;
    }

    async transaction<
        T extends IJanusWsBaseMessage = IJanusWsBaseMessage,
        P extends IJanusWsTransactionPayload = {}
    >(
        type: JanusTransactionType,
        payload: P,
        replyType?: JanusTransactionReplyType
    ) {
        if (!this.janus) {
            throw new Error('JanusPlugin is not connected.');
        }

        const transactionPayload = { ...payload, handle_id: this.handleId };

        return this.janus.transaction<T, P>(
            type,
            replyType,
            transactionPayload
        );
    }

    success(janus: JanusWs<TSocket>, handleId: string) {
        this.janus = janus;
        this.handleId = handleId;

        this.emit('success');

        return this;
    }

    onmessage(data: any, json: any) {
        debug(
            'Unhandled message from janus in a plugin: %s',
            this.constructor.name,
            data,
            json
        );
    }

    hangup() {
        this.emit('hangup');
    }

    slowLink(uplink: boolean, nacks: number) {
        this.emit('slowlink', uplink, nacks);
    }

    mediaState(medium: any, on: any) {
        this.emit('mediaState', medium, on);
    }

    webrtcState(isReady: boolean, cause?: string) {
        this.emit('webrtcState', isReady, cause);
    }

    detach() {
        this.removeAllListeners();
        this.janus = undefined;
    }
}
