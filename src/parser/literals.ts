import {Parser} from '.';
import {BaseToken, Token} from './base';
import {LexerType, ParserType, TokenType} from './symbols';

export class Literal extends BaseToken {}

export class ParserString extends Literal {

    contents?: string;

    introducer?: Token;

    constructor(token: Token, introducer?: Token) {
        super({start: introducer?.start ?? token.start, end: token.end, text: token.text, type: ParserType.ParserString})
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
        if ([LexerType.String, LexerType.Introducer].includes(parser.currToken.type as LexerType)) {
            let introducer: Token | undefined = undefined;
            if (parser.currToken.type === LexerType.Introducer) {
                introducer = parser.currToken ;
                parser.index++;
            }
            str = parser.currToken;
            if (str.type !== LexerType.String) {
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
            type: ParserType.ParserTimeDate,
            start,
            end: parser.currToken.end,
            text: parser.text.substring(start, parser.currToken.end)
        })
        this.dateString = dateString;
    }
}