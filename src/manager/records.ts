import { Answer } from 'multicast-dns';
import fastDeepEqual from 'fast-deep-equal';
import { decodeTXT } from './txt';
import { Event, Subscribable } from 'atvik';

export type AnswerWithoutType = Omit<Answer, 'type'>;

export function mapAnswer(answer: Answer): Record {
	switch(answer.type) {
		case 'A':
			return new ARecord(answer);
		case 'AAAA':
			return new AAAARecord(answer);
		case 'TXT':
			return new TXTRecord(answer);
		case 'SRV':
			return new SRVRecord(answer);
		case 'PTR':
			return new PTRRecord(answer);
		default:
			return new UnknownRecord(answer);
	}
}

export abstract class Record {
	public abstract readonly type: string;

	private readonly expireEvent: Event<Record>;
	private readonly refreshEvent: Event<Record>;

	public readonly name: string;
	public readonly class: string;
	public readonly flush: boolean;

	public lastRefresh: number;
	public ttl?: number;

	constructor(answer: AnswerWithoutType) {
		this.name = answer.name || '';
		this.class = answer.class || 'IN';
		this.flush = answer.flush || false;
		this.ttl = answer.ttl;
		this.lastRefresh = Date.now();

		this.expireEvent = new Event<Record>(this);
		this.refreshEvent = new Event<Record>(this);
	}

	public destroy() {
		this.expireEvent.emit();
	}

	public refresh(ttl: number) {
		this.ttl = ttl;
		this.lastRefresh = Date.now();

		this.refreshEvent.emit();
	}

	get onExpire(): Subscribable<Record> {
		return this.expireEvent.subscribable;
	}

	get onRefresh(): Subscribable<Record> {
		return this.refreshEvent.subscribable;
	}

	public isEqual(other: Record) {
		if(other.type !== this.type) {
			return false;
		}

		if(other.name !== this.name) {
			return false;
		}

		return this.isDataEqual(other as this);
	}

	protected abstract isDataEqual(other: this): boolean;

	public toAnswer(): Answer {
		return {
			type: this.type,
			name: this.name,
			ttl: this.ttl,
			class: this.class,
			flush: this.flush,
			data: this.toData()
		};
	}

	protected abstract toData(): any;
}

export class ARecord extends Record {
	public readonly type = 'A';

	public readonly ip: string;

	constructor(answer: AnswerWithoutType) {
		super(answer);

		this.ip = answer.data;
	}

	protected isDataEqual(other: this) {
		return this.ip === other.ip;
	}

	protected toData() {
		return this.ip;
	}
}

export class AAAARecord extends Record {
	public readonly type = 'AAAA';

	public readonly ip: string;

	constructor(answer: AnswerWithoutType) {
		super(answer);

		this.ip = answer.data;
	}

	protected isDataEqual(other: this) {
		return this.ip === other.ip;
	}

	protected toData() {
		return this.ip;
	}
}

export class SRVRecord extends Record {
	public readonly type = 'SRV';

	public readonly target: string;
	public readonly port: number;

	constructor(answer: AnswerWithoutType) {
		super(answer);

		this.target = answer.data.target;
		this.port = answer.data.port;
	}

	protected isDataEqual(other: this) {
		return this.target === other.target && this.port === other.port;
	}

	protected toData() {
		return {
			target: this.target,
			port: this.port
		};
	}
}

export class PTRRecord extends Record {
	public readonly type = 'PTR';

	public readonly hostname: string;

	constructor(answer: AnswerWithoutType) {
		super(answer);

		this.hostname = answer.data;
	}

	protected isDataEqual(other: this) {
		return this.hostname === other.hostname;
	}

	protected toData() {
		return this.hostname;
	}
}

export class TXTRecord extends Record {
	public readonly type = 'TXT';

	public readonly data: Map<string, string | boolean>;
	public readonly binaryData: Buffer[];

	constructor(answer: AnswerWithoutType, decode=true) {
		super(answer);

		this.binaryData = answer.data;
		this.data = new Map();
		if(decode) {
			for(const b of this.binaryData) {
				const decoded = decodeTXT(b);
				if(decoded) {
					this.data.set(decoded.key, decoded.value);
				}
			}
		}
	}

	protected isDataEqual(other: this) {
		return fastDeepEqual(this.binaryData, this.binaryData);
	}

	protected toData() {
		return this.binaryData;
	}
}

export class UnknownRecord extends Record {
	public readonly type: string;
	public readonly data: any;

	constructor(answer: Answer) {
		super(answer);

		this.type = answer.type;
		this.data = answer.data;
	}

	protected isDataEqual(other: this) {
		return fastDeepEqual(this.data, other.data);
	}

	protected toData() {
		return this.data;
	}
}
