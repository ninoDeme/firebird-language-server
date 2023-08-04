import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {REGULAR_IDENTIFIER, RESERVED_WORDS} from './symbols';
import {consumeCommentsAndWhitespace} from './utils';

export class BaseState implements State, Token {
    parser: Parser;
    static match: RegExp;
    parse() {
        throw new Error('not implemented');
    }
    flush(state?: State) {
        this.parser.state.splice(this.parser.state.findIndex(el => el === state ?? this, 1));
    }
    text!: string;
    start!: number;
    end!: number;
    constructor(parser: Parser, start?: number) {
        this.parser = parser;
        this.start = start ?? parser.index;
    }
}

export class BaseToken implements Token {
    text: string;
    start: number;
    end: number;

    constructor(token: Token);
    constructor(token: string, parser: Parser);
    constructor(token: Token | string, parser?: Parser) {
        if (typeof token !== 'string') {
            this.start = token.start;
            this.end = token.end;
            this.text = token.text;
        } else {
            this.text = token;
            if (parser) {
                this.start = parser.index;
                parser.index += token.length;
                this.end = parser.index;
            } else {
                this.start = 0;
                this.end = this.text.length;
            }
        }
    }
}

export class BaseTable extends BaseState implements Table {
    name?: string;
    alias?: string;

    parse() {
        const token = this.parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}`))?.[0];
        if (token == null) {
            throw new Error('Could not get identifier');
        }
        this.start = this.parser.index;
        this.name = token;
        this.parser.index += token.length;

        this.parseAlias();

        this.flush();
    }

    parseAlias() {

        consumeCommentsAndWhitespace(this.parser);

        let hasAS = false;
        if (this.parser.currText.match(/^as([^\w$]|$)/i)) {
            this.parser.index += 2;
            consumeCommentsAndWhitespace(this.parser);
            hasAS = true;
        }

        const token = this.parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}`))?.[0];

        if (token && !RESERVED_WORDS.has(token.toUpperCase())) {
            this.alias = token;
        } else {
            if (hasAS) {
                if (token) {
                    this.parser.problems.push({
                        start: this.parser.index,
                        end: this.parser.index + token.length,
                        message: `Invalid alias, ${token} is a reserved keyword`
                    });
                    this.alias = token;
                } else {
                    this.parser.problems.push({
                        start: this.parser.index,
                        end: this.parser.index,
                        message: `Missing or invalid Alias`
                    });
                }
            }
        }
        this.parser.index += (this.alias ?? '').length;
    }
}

export class BaseLiteral extends BaseToken implements Literal {
    static match(parser: Parser): unknown | undefined {
        throw new Error('Not Implemented');
    };
    type = ParserType.Never;
}

export interface Table {
    name?: string;
    alias?: string;
}

export interface State {
    parser: Parser;
    parse: () => void;
    flush: () => void;
}

export interface Token {
    text: string;
    start: number;
    end: number;
}

export interface Problem {
    start: number;
    end: number;
    message: string;
    severity?: DiagnosticSeverity;
}

export interface Literal extends Token {
    readonly type: ParserType;
}

export enum ParserType {
    Integer,       // 0, -34, 45, 0X080000000;
    FixedPoint,    // 0.0, -3.14
    FloatingPoint, // 3.23e-23;
    String,        // 'text', 'don''t!';
    HexString,  // x'48656C6C6F20776F726C64'
    Date,          // DATE '2018-01-19';
    Time,          // TIME '15:12:56';
    Timestamp,     // TIMESTAMP '2018-01-19 13:32:02';
    Boolean,       // true, false, unknown
    NullState,     // null
    Never
}