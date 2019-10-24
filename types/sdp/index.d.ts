declare module 'sdp' {
    interface Candidate {
        foundation: string;
        component: number;
        protocol: string;
        priority: number;
        ip: string;
        address: string;
        port: number;
        type: string;
        relatedAddress?: string;
        relatedPort?: number;
        tcpType?: string;
        ufrag?: string;
        usernameFragment?: string;
        [key: string]: string | number | undefined;
    }
    interface RTPMap {
        payloadType: number;
        name: string;
        clockRate: number;
        channels: number;
        /**
         * @deprecated
         */
        numChannels: number;
    }
    interface ExtMap {
        id: number;
        direction: string;
        uri: string;
    }
    interface FMTP {
        [key: string]: string;
    }
    interface SSRCMedia {
        ssrc: number;
        attribute: string;
        value?: string;
    }
    interface SSRCGroup {
        semantics: string[];
        ssrcs: number[];
    }
    interface RtpParameters extends RTCRtpParameters {
        fecMechanisms: string[];
    }
    interface MsId {
        stream: string;
        track: string;
    }
    interface SCTPDescription {
        port: number;
        protocol: string;
        maxMessageSize: number;
    }
    interface RTCMedia {
        kind: string;
        protocol: string;
    }
    interface MLine {
        kind: string;
        port: number;
        protocol: string;
        fmt: string;
    }
    interface OLine {
        username: string;
        sessionId: string;
        sessionVersion: number;
        netType: string;
        addressType: string;
        address: string;
    }
    export default class SDPUtils {
        static generateIdentifier(): string;
        static localCName: string;
        static splitLines(blob: string): string[];
        static splitSections(blob: string): string[];
        static getDescription(blob: string): string;
        static getMediaSections(blob: string): string[];
        static matchPrefix(blob: string, prefix: string): string[];
        static parseCandidate(line: string): Candidate;
        static writeCandidate(candidate: Candidate): string;
        static parseIceOptions(line: string): string[];
        static parseRtpMap(line: string): RTPMap;
        static writeRtpMap(
            codec: RTCRtpCodecCapability | RTCRtpCodecParameters
        ): string;
        static parseExtmap(line: string): ExtMap;
        static writeExtmap(extMap: RTCRtpHeaderExtension): string;
        static parseFmtp(line: string): FMTP;
        static writeFmtp(
            codec: RTCRtpCodecCapability | RTCRtpCodecParameters
        ): string;
        static parseRtcpFb(line: string): RTCRtcpFeedback;
        static writeRtcpFb(
            codec: RTCRtpCodecCapability | RTCRtpCodecParameters
        ): string;
        static parseSsrcMedia(line: string): SSRCMedia;
        static parseSsrcGroup(line: string): SSRCGroup;
        static getMid(mediaSection: string): string | void;
        static parseFingerprint(line: string): RTCDtlsFingerprint;
        static getDtlsParameters(
            mediaSection: string,
            sessionpart: string
        ): RTCDtlsParameters;
        static writeDtlsParameters(
            param: { fingerprints: RTCDtlsFingerprint[] },
            setupType: 'active' | 'passive' | 'actpassive' | 'holdconn'
        ): string;
        static getIceParameters(
            mediaSection: string,
            sessionpart: string
        ): RTCIceParameters;
        static writeIceParameters(params: RTCIceParameters): string;
        static parseRtpParameters(mediaSection: string): RtpParameters;
        static writeRtpDescription(
            kind: 'audio' | 'video',
            caps: RTCRtpParameters
        ): string;
        static parseRtpEncodingParameters(
            mediaSection: string
        ): RTCRtpEncodingParameters;
        static parseRtcpParameters(mediaSection: string): RTCRtpParameters;
        static parseMsid(mediaSection: string): MsId;
        static parseSctpDescription(
            mediaSection: string
        ): SCTPDescription | void;
        static writeSctpDescription(
            media: RTCMedia,
            sctp: SCTPDescription
        ): string;
        static generateSessionId(): string;
        static writeSessionBoilerplate(
            sessId: string,
            sessVer?: number,
            sessUser?: string
        ): string;
        static writeMediaSection(
            transceiver: RTCRtpTransceiver,
            caps: RTCRtpParameters,
            type: RTCSdpType,
            stream: MediaStream
        ): string;
        static getDirection(
            mediaSection: string,
            sessionpart: string
        ): RTCRtpTransceiverDirection;
        static getKind(mediaSection: string): string;
        static isRejected(mediaSection: string): boolean;
        static parseMLine(mediasection: string): MLine;
        static parseOLine(mediaSection: string): OLine;
        static isValidSDP(blob: string): boolean;
    }
}
