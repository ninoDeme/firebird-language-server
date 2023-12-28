import {Parser} from '.';
import {BaseToken} from './base';
import {Token} from './lexer';
import {TokenType} from './symbols';

export class Literal extends BaseToken {}

export class ParserString extends Literal {

    contents?: string;

    introducer?: Token;

    constructor(token: Token, introducer?: Token) {
        super({start: introducer?.start ?? token.start, end: token.end, text: token.text})
        if ('contents' in token) {
            this.contents = token.contents as string;
        }
    }
}

export class ParserTimeDate extends Literal {

    dateString: ParserString | undefined;

    constructor(parser: Parser) {
        const start = parser.currToken.start;
        parser.index++;
        let str;
        let dateString;
        if ([TokenType.String, TokenType.Introducer].includes(parser.currToken.type)) {
            let introducer: Token | undefined = undefined;
            if (parser.currToken.type === TokenType.Introducer) {
                introducer = parser.currToken ;
                parser.index++;
            }
            str = parser.currToken;
            if (str.type !== TokenType.String) {
                parser.problems.push({
                    start: parser.index,
                    end: parser.index + 1,
                    message: `Expected string after introducer declaration, found: ${str.text}`
                })
            } else {
                dateString = new ParserString(str, introducer)
            }
        } else {
            parser.problems.push({
                start: parser.index,
                end: parser.index + 1,
                message: 'Expected TimeDate String'
            })
        }
        super({
            start,
            end: parser.currToken.end,
            text: parser.text.substring(start, parser.currToken.end)
        })
        this.dateString = dateString;
    }
}