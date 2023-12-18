import {Parser} from '.';
import {BaseLiteral} from './base';
import {LexedToken} from './lexer';
import {TokenType} from './symbols';

class ParserString extends BaseLiteral {

    // type: LiteralType.String | LiteralType.HexString;

    contents?: string;

    introducer?: LexedToken;

    constructor(token: LexedToken, introducer?: LexedToken) {
        super({start: introducer?.start ?? token.start, end: token.end, text: token.text})
        if ('contents' in token) {
            this.contents = token.contents as string;
        }
    }
}

class BaseTimeDate extends BaseLiteral {

    dateString: ParserString | undefined;

    constructor(text: string, parser: Parser) {
        const start = parser.currToken.start;
        parser.index++;
        let str;
        let dateString;
        if ([TokenType.String, TokenType.Introducer].includes(parser.currToken.type)) {
            let introducer: LexedToken | undefined = undefined;
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