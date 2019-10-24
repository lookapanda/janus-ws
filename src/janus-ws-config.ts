/* tslint:disable:max-classes-per-file */
export interface IJanusWsConfigConstructor {
    url: string;
    adapter: any;
    connectionTriesLimit?: number;
    connectionTimeout?: number;
    reconnect?: boolean;
    createSessionOnConnect?: boolean;
    keepAliveInterval?: number;
    keepAliveTimeout?: number;
}

export interface IJanusWsConfig {
    readonly url: string;
    readonly adapter: any;
    readonly connectionTriesLimit: number;
    readonly connectionTimeout: number;
    readonly reconnect: boolean;
    readonly createSessionOnConnect: boolean;
    readonly keepAliveInterval: number;
    readonly keepAliveTimeout: number;
}

export class JanusWsConfig implements IJanusWsConfig {
    readonly url: string = '';
    readonly adapter: any;
    readonly connectionTriesLimit: number = 0;
    readonly connectionTimeout: number = 5 * 1000;
    readonly reconnect: boolean = false;
    readonly createSessionOnConnect: boolean = true;
    readonly keepAliveInterval: number = 5 * 1000;
    readonly keepAliveTimeout: number = 3 * 1000;

    constructor(config: IJanusWsConfigConstructor) {
        Object.assign(this, config);
    }
}
