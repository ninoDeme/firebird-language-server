import {Parser} from '.';
import {BaseLiteral, Literal, ParserType as LiteralType} from './base';
import {consumeCommentsAndWhitespace, nextTokenError} from './utils';

class ParserInteger extends BaseLiteral {
    type: LiteralType.Integer = LiteralType.Integer;

    static match(parser: Parser) {
        return parser.currText.match(/^-?0x[\da-f]+/i)?.[0] || parser.currText.match(/^-?\d+(?!\.|\d|e\d+)/)?.[0];
    };

}

class ParserFixedPoint extends BaseLiteral {
    type: LiteralType.FixedPoint = LiteralType.FixedPoint;

    static match(parser: Parser) {
        return parser.currText.match(/^-?\d+?\.\d+(?!\d|e\d+)/i)?.[0];
    };
}

class ParserFloatingPoint extends BaseLiteral {
    type: LiteralType.FloatingPoint = LiteralType.FloatingPoint;

    static match(parser: Parser) {
        return parser.currText.match(/^-?\d+\.?\d+e-?\d*(?!\d)/i)?.[0];
    };
}

class ParserString extends BaseLiteral {

    type: LiteralType.String | LiteralType.HexString;

    stringContents: string;

    introducer?: string;

    static match(parser: Parser) {
        if (parser.currText.startsWith('_')) {
            return '';
        }
        return parser.currText.match(/^'/)?.[0] ?? parser.currText.match(/^q'./i)?.[0] ?? parser.currText.match(/^x'/i)?.[0];
    };

    constructor(text: string | null, parser: Parser) {
        let start = parser.index;
        let type: LiteralType.String | LiteralType.HexString = LiteralType.String 
        let introducer: string | undefined;
        let match: RegExpMatchArray | [string] | null;
        let contents: string;
        if (text === '') {
            introducer = parser.currText.match(/_[\w$]*/)?.[0];
            if (introducer) parser.index += introducer?.length;
            consumeCommentsAndWhitespace(parser);
            text = parser.currText.match(/^'/)?.[0] ?? parser.currText.match(/^q'./i)?.[0] ?? parser.currText.match(/^x'/i)?.[0] ?? null;
            if (text == null) {
                if (introducer) {
                    nextTokenError(parser, "Expected string after introducer")
                } else {
                    throw new Error('Invalid String');
                }
            }
        }
        if (text == null) {
            contents = '';
            match = ['']
        } else if (/q/i.test(text)) {
            let delimiter = text[text.length-1];
            delimiter = DELIMITER_PAIR[delimiter] ?? delimiter
            match = parser.currText.match(new RegExp(`q'.([\\s\\S]*?)(?:${delimiter}'|($))`, 'i'));
            if (!match) {
                throw new Error('Invalid String');
            } 
            contents = match[1]
        } else if (/x/i.test(text)) {
            match = parser.currText.match(/^x'((?:[^']|'')*)(?:'|($))/i);

            if (!match) {
                throw new Error('Invalid String');
            } 

            contents = match[1]
            type = LiteralType.HexString;
        } else if (text.startsWith("'")) {
            match = parser.currText.match(/^'((?:[^']|'')*)(?:'|($))/);
            
            if (!match) {
                throw new Error('Invalid String');
            } 
            
            contents = match[1].replace(/''/g, "'");
        } else {
            throw new Error('Invalid String');
        }
        if (match[2] != null) {
            parser.problems.push({
                start,
                end: parser.text.length,
                message: "Unterminated String Literal"
            })
        }
        parser.index += match[0].length;
        
        super({start, end: parser.index, text: parser.text.substring(start, parser.index)});
        this.stringContents = contents;
        this.type = type;
        this.introducer = introducer;
    }
}

abstract class BaseTimeDate extends BaseLiteral {

    type: LiteralType.Date | LiteralType.Time | LiteralType.Timestamp | LiteralType.Never = LiteralType.Never;

    dateString: ParserString | undefined;

    constructor(text: string, parser: Parser) {
        const start = parser.index;
        parser.index += text.length;
        consumeCommentsAndWhitespace(parser);

        let str;
        let dateString;
        if (str = ParserString.match(parser)) {
            dateString = new ParserString(str, parser)
        } else {
            parser.problems.push({
                start: parser.index,
                end: parser.index + 1,
                message: 'Expected TimeDate String'
            })
        }
        super({
            start,
            end: parser.index,
            text: parser.text.substring(start, parser.index)
        })
        this.dateString = dateString;
    }
}
class ParserDate extends BaseTimeDate {

    type: LiteralType.Date = LiteralType.Date;

    static match(parser: Parser) {
        return parser.currText.match(/^date(?=[^\w$]|$)/i)?.[0]
    }
}

class ParserTimeStamp extends BaseTimeDate {

    type: LiteralType.Timestamp = LiteralType.Timestamp;

    static match(parser: Parser) {
        return parser.currText.match(/^timestamp(?=[^\w$]|$)/i)?.[0]
    }
}

class ParserTime extends BaseTimeDate {

    type: LiteralType.Time = LiteralType.Time;

    static match(parser: Parser) {
        return parser.currText.match(/^time(?=[^\w$]|$)/i)?.[0]
    }
}
const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}

const TYPE_CLASSES = [ParserInteger, ParserFixedPoint, ParserFloatingPoint, ParserString, ParserDate, ParserTime, ParserTimeStamp]

export function literal(parser: Parser): Literal | null {
    for (let i of TYPE_CLASSES) {
        const result = i.match(parser);
        if (result != null) {
            return new i(result, parser);
        }
    }

    return null
}