import {TextDocument} from 'vscode-languageserver-textdocument';
import {State, BaseState, Problem, Token} from './base';
import {KEYWORDS, NON_REGULAR_IDENTIFIER_REGEX, OPERATORS_REGEX, REGULAR_IDENTIFIER_REGEX, RESERVED_WORDS, SPECIAL_CHARACTERS_REGEX, TokenType, VARIABLE_REGEX} from './symbols';

export class Lexer {


    constructor(document: TextDocument | string) {
        if (typeof document === 'string') {
            this.text = document;
        } else {

            this.text = document.getText();
        }
        this._index = 0;
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

        // let qtds: {[key in TokenType]?: number} = {};
        // for (let t of this.tokens) {
        //     qtds[t.type] = (qtds[t.type] ?? 0) + 1
        // }
        // console.log(Object.entries(qtds).map(([key, value]) => `${TokenType[parseInt(key)]} => ${value}`))
        // console.log(`Comments => ${this.comments.length}`)
        // console.log(`WhiteSpace => ${this.whiteSpace.length}`)
        return this.parsed;
    }

    getToken(): LexedToken {
        const currText = this.currText;
        if (currText.length === 0) {
            return this.token('', TokenType.EOF);
        }

        let token = matchWS(currText);
        if (token) {
            return this.token(token, TokenType.WhiteSpace);
        }

        if (token = currText.match(REGULAR_IDENTIFIER_REGEX)?.[0]) {
            let newToken = this.token(token, TokenType.RegularIdentifier) as LexedRegularIdentifier;
            if (KEYWORDS.has(token.toUpperCase())) {
                newToken.isKeyword = true;
                if (RESERVED_WORDS.has(token.toUpperCase())) {
                    newToken.isReserved = true;
                }
            }
            return newToken
        }

        if (currText.startsWith('.')) {
            return this.token('.', TokenType.Dot);
        }

        if (currText.startsWith(',')) {
            return this.token(',', TokenType.Comma);
        }

        if (currText.startsWith('"') && (token = currText.match(NON_REGULAR_IDENTIFIER_REGEX)?.[0])) {
            return this.token(token, TokenType.NonRegularIdentifier);
        }

        if (currText.startsWith(':') && (token = currText.match(VARIABLE_REGEX)?.[0])) {
            return this.token(token, TokenType.Variable);
        }

        if (currText.startsWith('_') && (token = currText.match(/^_[\w$]*/)?.[0])) {
            return this.token(token, TokenType.Introducer);
        }

        let stringToken: LexedString | null;
        if (stringToken = matchString(currText, this)) {
            return stringToken;
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

        if (token = currText.match(/^(--.*|\/\*[\s\S]*?\*\/)/)?.[0]) {
            return this.token(token, TokenType.Comment);
        }

        if (token = currText.match(OPERATORS_REGEX)?.[0]) {
            return this.token(token, TokenType.Operator);
        }

        if (token = currText.match(SPECIAL_CHARACTERS_REGEX)?.[0]) {
            return this.token(token, TokenType.SpecialCharacter);
        }

        throw new Error("Unknown character: " + currText[0]);
    }

    token(text: string, type: TokenType) {
        let t: Partial<LexedToken> = {};
        t.start = this.index;
        t.end = this.index + text.length;
        t.text = text;
        t.type = type;
        t.typeText = TokenType[type] as keyof typeof TokenType;
        return t as LexedToken;
    }
}

const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}

const WHITESPACE = new Set(['\t', ' ', '\n', '\r', '\v', '\x12'])

function matchWS(currText: string): string | undefined {
    let index = 0
    for (let char of currText) {
        if (WHITESPACE.has(char)) {
            index++;
        } else {
            break;
        }
    }
    if (index > 0) {
        return currText.substring(0, index);
    }
    return undefined;
}

function matchString(currText: string, lexer: Lexer): LexedString | null {
    let res: RegExpMatchArray | null = null;
    if (currText.substring(0, 2).toLowerCase() === "q'") {
        let delimiter = currText[currText.length - 1];
        delimiter = DELIMITER_PAIR[delimiter] ?? delimiter;
        res = currText.match(new RegExp(`^q'.([\\s\\S]*?)(?:${delimiter}'|($))`, 'i'));
    }
    else if (currText.substring(0, 2).toLowerCase() === "x'") {
        res = currText.match(/^x'((?:[^']|'')*)(?:'|($))/i);
    } else if (currText.startsWith("'")) {
        res = currText.match(/^'((?:[^']|'')*)(?:'|($))/);
    }
    if (res) {
        let token: Partial<LexedString> = lexer.token(res[0], TokenType.String) as LexedString;
        token.contents = res[1];
        return token as LexedString;
    }
    return null;
}

export interface LexedToken extends Token {
    type: TokenType;
    typeText?: keyof typeof TokenType;
}

export interface LexedRegularIdentifier extends LexedToken {
    type: TokenType.RegularIdentifier;
    isKeyword?: boolean;
    isReserved?: boolean;
}

export interface LexedString extends LexedToken {
    type: TokenType.String;
    contents: string;
}