import { debug as debugModule } from 'debug';
import {
    IJanusWsBaseMessage,
    IJanusWsEventMessage,
    IJanusWsSuccessMessage,
    IJanusWsTransactionPayload,
    JanusWsPlugin,
} from '../';
import { SdpHelper } from '../utils';

const debug = debugModule('janus-ws-streaming-plugin');
const debugOnData = debugModule('janus-ws-streaming-plugin:data');

export enum StreamingRequest {
    create = 'create',
    destroy = 'destroy',
    list = 'list',
    watch = 'watch',
    start = 'start',
    stop = 'stop',
    pause = 'pause',
    info = 'info',
    switch = 'switch',
}

export interface IStreamingRequestPayloadBody {
    request: StreamingRequest;
}

export interface IStreamingCreateMessageParameters {
    id?: number;
    name?: string;
    description?: string;
    audio?: boolean;
    video?: boolean;
    is_private?: boolean;
    pin?: number;
    secret?: string;
    permanent?: boolean;
    rtp?: {
        data?: boolean;
        collission?: any;
        srtpsuite?: any;
        srtpcrypto?: any;
    };
    live?: string;
    ondemand?: string;
    rtsp?: any;
}

export interface IStreamingCreateMessagePayloadBody
    extends IStreamingCreateMessageParameters {
    request: StreamingRequest.create;
}

export interface IStreamingDestroyMessagePayloadBody {
    request: StreamingRequest.destroy;
    id: string;
    permanent?: boolean;
}

export interface IStreamingMessagePayloadBody {
    request: StreamingRequest;
}

export interface IStreamingWatchMessagePayloadBody {
    request: StreamingRequest.watch;
    id: number;
}

export interface IStreamingInfoMessagePayloadBody {
    request: StreamingRequest.info;
    id: number;
}

export interface IStreamingSwitchMessagePayloadBody {
    request: StreamingRequest.switch;
    id: number;
}

export interface IStreamingRequestPayload extends IJanusWsTransactionPayload {
    body: IStreamingRequestPayloadBody;
}

export interface IStreamingCandidatePayload extends IJanusWsTransactionPayload {
    candidate: RTCIceCandidate | { completed: boolean };
}

export interface IMedia {
    age_ms: number;
    label: string;
    mid: string;
    type: string;
}
export interface IStream {
    description: string;
    id: number;
    media: IMedia[];
    type: string;
}
export interface IListTransaction extends IJanusWsBaseMessage {
    data: {
        list: IStream[];
        streaming: string;
    };
    json: {
        janus: string;
        plugindata: {
            data: {
                list: IStream[];
                streaming: string;
            };
            plugin: string;
        };
        sender: number;
        session_id: number;
        transaction: string;
    };
}

export interface IStreamingPluginDataData {
    streaming: 'event';
    result: {
        status?: 'preparing' | 'starting' | 'started';
        switched?: 'ok';
        id?: number;
    };
}

export class JanusWsStreamingPlugin<
    TSocket extends WebSocket = WebSocket
> extends JanusWsPlugin<TSocket> {
    protected pluginName = 'janus.plugin.streaming';
    private filterDirectCandidates: boolean;
    private sdpHelper: SdpHelper;

    constructor(filterDirectCandidates: boolean = false) {
        super();
        this.filterDirectCandidates = filterDirectCandidates;
        this.sdpHelper = new SdpHelper();
    }

    async create(parameters: IStreamingCreateMessageParameters) {
        const body: IStreamingCreateMessagePayloadBody = {
            ...parameters,
            request: StreamingRequest.create,
        };
        try {
            const { data, json } = await this.transaction<
                IJanusWsSuccessMessage,
                IStreamingRequestPayload
            >('message', { body }, 'success');
            if (data.error_code) {
                debug('StreamingJanusPlugin error while create', data);
                throw new Error('StreamingJanusPlugin error while create');
            }
            return { data, json };
        } catch (err) {
            debug('StreamingJanusPlugin, cannot create stream', err);
            throw err;
        }
    }

    async destroy(id: string, permanent: boolean = false) {
        const body: IStreamingDestroyMessagePayloadBody = {
            request: StreamingRequest.destroy,
            id,
            permanent,
        };

        try {
            return await this.transaction<
                IJanusWsSuccessMessage,
                IStreamingRequestPayload
            >('message', { body }, 'success');
        } catch (err) {
            debug('StreamingJanusPlugin, cannot destroy stream', err);
            throw err;
        }
    }

    async list() {
        const body: IStreamingMessagePayloadBody = {
            request: StreamingRequest.list,
        };
        try {
            return await this.transaction<
                IListTransaction,
                IStreamingRequestPayload
            >(
                'message',
                {
                    body,
                },
                'success'
            );
        } catch (err) {
            debug('JanusWsStreamingPlugin, cannot list streams', err);
            throw err;
        }
    }

    async watch(id: number): Promise<RTCSessionDescriptionInit> {
        const body: IStreamingWatchMessagePayloadBody = {
            request: StreamingRequest.watch,
            id,
        };

        try {
            const {
                jsep,
                plugindata: {
                    data: { result },
                },
            } = await this.eventTransaction({ body });

            if (!jsep) {
                throw new Error(
                    'StreamingJanusPlugin watch answer does not contain jsep'
                );
            }

            if (result && result.status) {
                this.emit('statusChange', result.status);
            }

            if (this.filterDirectCandidates && jsep.sdp) {
                jsep.sdp = this.sdpHelper.filterDirectCandidates(jsep.sdp);
            }

            this.emit('jsep', jsep);
            return jsep;
        } catch (err) {
            debug('StreamingJanusPlugin, cannot watch stream', err);
            return err;
        }
    }

    start(jsep?: RTCSessionDescriptionInit) {
        return this.playStateRequest(StreamingRequest.start, jsep);
    }

    stop() {
        return this.playStateRequest(StreamingRequest.stop);
    }

    pause() {
        return this.playStateRequest(StreamingRequest.pause);
    }

    async info(id: number) {
        const body: IStreamingInfoMessagePayloadBody = {
            request: StreamingRequest.info,
            id,
        };

        try {
            return await this.transaction<
                IJanusWsSuccessMessage,
                IStreamingRequestPayload
            >('message', { body }, 'success');
        } catch (err) {
            debug('StreamingJanusPlugin, info error', err);
        }
    }

    async switch(id: number) {
        const body: IStreamingSwitchMessagePayloadBody = {
            request: StreamingRequest.switch,
            id,
        };

        try {
            return await this.transaction<
                IJanusWsSuccessMessage,
                IStreamingRequestPayload
            >('message', { body }, 'success');
        } catch (err) {
            debug('StreamingJanusPlugin, switch error', err);
        }
    }

    onmessage(data: any, json: any) {
        if (
            data &&
            data.streaming === 'event' &&
            data.result &&
            data.result.status
        ) {
            this.emit('statusChange', data.result.status);
        } else {
            debug('StreamingJanusPlugin got unknown message', data, json);
        }
    }

    ondataopen = () => {
        debugOnData('Data channel opened.');
    };

    ondata = (event: MessageEvent) => {
        debugOnData('Received data:', event.data);
        this.emit('data', event.data);
    };

    candidate(candidate?: RTCIceCandidate, completed = false) {
        if (
            this.filterDirectCandidates &&
            candidate &&
            candidate.candidate &&
            this.sdpHelper.isDirectCandidate(candidate.candidate)
        ) {
            return;
        }
        const request = completed
            ? { candidate: { completed } }
            : { candidate };
        return this.transaction<IJanusWsBaseMessage>('trickle', request);
    }

    private async playStateRequest(
        playState:
            | StreamingRequest.start
            | StreamingRequest.stop
            | StreamingRequest.pause,
        jsep?: RTCSessionDescriptionInit
    ) {
        const body: IStreamingMessagePayloadBody = {
            request: playState,
        };
        const request: {
            body: IStreamingMessagePayloadBody;
            jsep?: RTCSessionDescriptionInit;
        } = { body };
        if (jsep) {
            request.jsep = jsep;
        }

        try {
            const transaction = await this.eventTransaction(request);
            const {
                plugindata: {
                    data: { result },
                },
            } = transaction;

            if (result && result.status) {
                this.emit('statusChange', result.status);
            }

            return transaction;
        } catch (err) {
            debug('StreamingJanusPlugin, playState error', err);
            throw new err();
        }
    }

    private eventTransaction<T extends IStreamingRequestPayload>(payload: T) {
        return this.transaction<IJanusWsEventMessage<IStreamingPluginDataData>>(
            'message',
            payload,
            'event'
        );
    }
}
