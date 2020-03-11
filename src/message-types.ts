export type JanusWsMessageType =
    | 'timeout'
    | 'keepalive'
    | 'ack'
    | 'success'
    | 'webrtcup'
    | 'hangup'
    | 'detached'
    | 'media'
    | 'slowlink'
    | 'error'
    | 'event';

export type JanusTransactionType =
    | 'trickle'
    | 'message'
    | 'create'
    | 'attach'
    | 'destroy'
    | 'detach'
    | 'keepalive';

export type JanusTransactionReplyType = 'success' | 'ack' | 'event';

export interface IJanusWsPluginData<T> {
    plugin: string;
    data: T;
}

export interface IJanusWsTransactionPayload {
    session_id?: number;
}

export interface IJanusWsBaseMessage {
    janus: JanusWsMessageType;
    transaction: string;
    sender?: number;
    session_id?: number;
}

export interface IJanusWsTimeoutMessage extends IJanusWsBaseMessage {
    session_id: number;
}

export interface IJanusWsSuccessMessage<T = any> extends IJanusWsBaseMessage {
    janus: 'success';
    plugindata?: IJanusWsPluginData<T>;
    data?: any;
    json?: any;
}

export interface IJanusWsEventMessage<T> extends IJanusWsBaseMessage {
    janus: 'event';
    plugindata: IJanusWsPluginData<T>;
    jsep?: RTCSessionDescriptionInit;
    error_code?: number;
}

export interface IJanusWsSlowlinkMessage extends IJanusWsBaseMessage {
    janus: 'slowlink';
    uplink: boolean;
    nacks?: number;
    lost: number;
}

export interface IJanusWsHangupMessage extends IJanusWsBaseMessage {
    janus: 'hangup';
    reason: string;
}

export interface IJanusWsMediaMessage extends IJanusWsBaseMessage {
    janus: 'media';
    type: any;
    receiving: boolean;
}

export interface IJanusWsErrorMessage extends IJanusWsBaseMessage {
    janus: 'error';
    error?: {
        code?: number;
    };
}
