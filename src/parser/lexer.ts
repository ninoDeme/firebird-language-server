import {TextDocument} from 'vscode-languageserver-textdocument';
import {statement} from '.';
import {State, BaseState, BaseToken, Problem, Token} from './base';
import {NON_REGULAR_IDENTIFIER, NON_REGULAR_IDENTIFIER_REGEX, OPERATORS, OPERATORS_REGEX, REGULAR_IDENTIFIER, REGULAR_IDENTIFIER_REGEX, RESERVED_WORDS, SPECIAL_CHARACTERS_REGEX, TokenType, VARIABLE_REGEX} from './symbols';
import {captureRejectionSymbol} from 'events';

export class Lexer {

    constructor(document: TextDocument | string, index: number = 0) {
        if (typeof document === 'string') {
            this.text = document;
        } else {

            this.text = document.getText();
        }
        this._index = index;
    }
    state: State[] = [];
    parsed: BaseState[] = [];
    text: string;
    private _index: number;
    public get index(): number {
        return this._index;
    }
    public set index(value: number) {
        if (value !== this._index) this._currText = undefined;
        this._index = value;
    }
    comments: LexedToken[] = [];
    whiteSpace: LexedToken[] = [];
    tokens: LexedToken[] = [];

    problems: Problem[] = [];

    private _currText: undefined | string;
    get currText() {
        return this._currText ?? (this._currText = this.text.substring(this.index));
    }

    parse() {
        try {
            this.index = 0;

        } catch (e) {
            console.error(e);
        }

        let match;
        do {
            match = this.getToken();
            if (match.type === TokenType.Comment) {
                this.comments.push(match)
            } else if (match.type === TokenType.WhiteSpace) {
                this.whiteSpace.push(match)
            } else {
                this.tokens.push(match);
            }
            this.index += match.text.length;
        } while (match?.type !== TokenType.EOF)

        return this.parsed;
    }

    getToken(): LexedToken {
        const currText = this.currText;
        if (currText.length === 0) {
            return this.token('', TokenType.EOF);
        }

        let token = currText.match(/^\s+/)?.[0];
        if (token) {
            return this.token(token, TokenType.WhiteSpace);
        }

        if (token = currText.match(/^--.*|\/\*[\s\S]*?\*\//)?.[0]) {
            return this.token(token, TokenType.Comment);
        }

        if (token = currText.match(/^\s+/)?.[0]) {
            return this.token(token, TokenType.WhiteSpace);
        }

        if (token = currText.match(REGULAR_IDENTIFIER_REGEX)?.[0]) {
            if (RESERVED_WORDS.has(token.toUpperCase())) {
                return this.token(token, TokenType.ReservedWord);
            }
            return this.token(token, TokenType.RegularIdentifier);
        }

        if (token = currText.match(NON_REGULAR_IDENTIFIER_REGEX)?.[0]) {
            return this.token(token, TokenType.NonRegularIdentifier);
        }

        if (token = currText.match(VARIABLE_REGEX)?.[0]) {
            return this.token(token, TokenType.Variable);
        }

        if (token = currText.match(/^_[\w$]*/)?.[0]) {
            return this.token(token, TokenType.Introducer);
        }

        if (token = matchString(currText, this)) {
            return this.token(token, TokenType.String);
        }

        if (/^\d/.test(currText)) {
            if (token = currText.match(/^0x[\da-f]+/i)?.[0] || currText.match(/^\d+(?!\.|\d|e\d+)/)?.[0]) {
                return this.token(token, TokenType.Integer);
            }

            if (token = currText.match(/^\d+?\.\d+(?!\d|e\d+)/i)?.[0]) {
                return this.token(token, TokenType.FixedPoint);
            }

            if (token = currText.match(/^\d+\.?\d+e-?\d*(?!\d)/i)?.[0]) {
                return this.token(token, TokenType.FloatingPoint);
            }
        }
        if (currText.startsWith('(')) {
            return this.token('(', TokenType.LParen);
        }

        if (currText.startsWith(')')) {
            return this.token(')', TokenType.RParen);
        }

        if (currText.startsWith(';')) {
            return this.token(';', TokenType.DotColon);
        }

        if (currText.startsWith('*')) {
            return this.token('*', TokenType.Asterisk);
        }

        if (currText.startsWith(',')) {
            return this.token(',', TokenType.Comma);
        }

        if (currText.startsWith('.')) {
            return this.token('.', TokenType.Dot);
        }

        if (token = currText.match(OPERATORS_REGEX)?.[0]) {
            return this.token(token, TokenType.Operator);
        }

        if (token = currText.match(SPECIAL_CHARACTERS_REGEX)?.[0]) {
            return this.token(token, TokenType.SpecialCharacter);
        }

        throw "Not Implemented";
    }

    token(text: string, type: TokenType) {
        let t: Partial<LexedToken> = {};
        t.start = this.index;
        t.end = this.index + text.length;
        t.text = text;
        t.type = type;
        return t as LexedToken;
    }
}

const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}

function matchString(currText: string, lexer: Lexer): string | undefined {
    if (/^q'/i.test(currText)) {
        let delimiter = currText[currText.length - 1];
        delimiter = DELIMITER_PAIR[delimiter] ?? delimiter;
        return currText.match(new RegExp(`^q'.([\\s\\S]*?)(?:${delimiter}'|($))`, 'i'))?.[0];
    }
    else if (/^x'/i.test(currText)) {
        return currText.match(/^x'((?:[^']|'')*)(?:'|($))/i)?.[0];
    } else if (currText.startsWith("'")) {
        return currText.match(/^'((?:[^']|'')*)(?:'|($))/)?.[0];
    }
    return undefined;
}

function makeToken(text: string, type: TokenType, lexer: Lexer): LexedToken {
    let t: Partial<LexedToken> = {};
    t.start = lexer.index;
    t.end = lexer.index + text.length;
    t.text = text;
    t.type = type;
    return t as LexedToken;
}

export interface LexedToken extends Token {
    type: TokenType;
}
