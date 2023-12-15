import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {IDENTIFIER, TokenType} from './symbols';

export class BaseState implements State, Token {
    parser: Parser;
    static match: RegExp;
    parse() {
        throw new Error('not implemented');
    }
    flush() {
        this.parser.state.splice(this.parser.state.findIndex(el => el === this), 1);
    }
    text!: string;
    start!: number;
    end!: number;
    constructor(parser: Parser, start?: number) {
        this.parser = parser;
        this.start = start ?? parser.currToken.start;
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
                parser.index++;
                this.end = parser.index;
            } else {
                this.start = 0;
                this.end = this.text.length;
            }
        }
    }
}

export class BaseTable extends BaseState implements Table {
    name?: Token;
    alias?: Token;

    parse() {
        const token = this.parser.currToken;
        this.start = token.start;
        this.name = token;
        this.parser.index++;

        this.parseAlias();

        this.flush();
    }

    parseAlias() {

        let hasAS = false;
        if (this.parser.currToken.text === 'AS') {
            this.parser.index++;
            hasAS = true;
        }

        const token = this.parser.currToken;

        if (IDENTIFIER.has(token.type)) {
            this.alias = token;
            this.parser.index++;
        } else if (hasAS) {
            if (token.type === TokenType.ReservedWord) {
                this.parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid alias, ${token} is a reserved keyword`
                });
                this.alias = token;
                this.parser.index++;
            } else {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: this.parser.index,
                    message: `Missing or invalid Alias`
                });
            }
        }
    }
}

export class BaseParenthesis implements State, Token {
    text!: string;
    start!: number;
    end!: number;

    parser: Parser;
    parse: () => void = () => {
        if (this.parser.currToken.type === TokenType.RParen) {
            return this.flush();
        }
        if (this.parser.currToken.type === TokenType.EOF || this.parser.currToken.type === TokenType.DotColon) {
            this.parser.problems.push({
                start: this.start,
                end: this.parser.currToken.end,
                message: `Unterminated Parenthesis`
            });
            return this.flush();
        }
        this.body.parse();
    };
    flush: () => void = () => {
        this.body.flush();
        this.end = this.parser.currToken.end;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.state.splice(this.parser.state.findIndex(el => el === this, 1));
    };

    body: ParenthesisBody;
    constructor(token: Token, body: ParenthesisBody, parser: Parser) {
        this.start = token.start;
        this.parser = parser;
        this.body = body;
        this.body.insideParenthesis = true;
    }
}

export class BaseLiteral extends BaseToken implements Literal {
    static match(parser: Parser): unknown | undefined {
        throw new Error('Not Implemented');
    };
    type = ParserType.Never;
}

export interface Table {
    name?: Token;
    alias?: Token;
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

export interface ParenthesisBody extends State {
    insideParenthesis: boolean;
}

export class EmptyParens implements ParenthesisBody {
    insideParenthesis: boolean = true;
    flush = () => this.parser.state.splice(this.parser.state.findIndex(el => el === this), 1);
    parse = () => this.flush();
    parser: Parser;

    constructor(parser: Parser) {
        this.parser = parser;
    }
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

export type JoinType = 'natural' | 'inner' | 'left' | 'right' | 'full' | 'NATURAL' | 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';