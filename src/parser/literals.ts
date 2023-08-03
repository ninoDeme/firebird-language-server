import {Parser} from '.';
import {BaseLiteral, Literal, ParserType, Token} from './base';

class ParserInteger extends BaseLiteral {
    type: ParserType.Integer = ParserType.Integer;

    static match(currText: string) {
        return currText.match(/^0x[\da-f]+/i)?.[0] || currText.match(/^-?\d+(?!\.)/)?.[0];
        // return currText.match(/^0x[\da-f]+/i)?.[0] || currText.match(/^-?\d+(?!\.)/)?.[0];
    };

}

class ParserFixedPoint extends BaseLiteral {
    type: ParserType.FixedPoint = ParserType.FixedPoint;

    static match(currText: string) {
        return currText.match(/^-?\d+?\.\d+(?!e\d+)/i)?.[0];
        // return currText.match(/^-?\d+?\.\d+(?!e\d+)/i)?.[0];
    };
}

class ParserFloatingPoint extends BaseLiteral {
    type: ParserType.FloatingPoint = ParserType.FloatingPoint;

    static match(currText: string) {
        return currText.match(/^\d+?\.?\d+e-?\d*/i)?.[0];
        // return currText.match(/^\d+?\.?\d+e-?\d*/i)?.[0];
    };
}

class ParserString extends BaseLiteral {

    type: ParserType.String = ParserType.String;

    stringContents?: string;

    static match(currText: string) {
        const normalString = currText.match(/^'((?:[^']|'')*)('|$)/)?.[0];
        // const normalString = currText.match(/^'((?:[^']|'')*)('|$)/)?.[0];
        if (normalString) {
            return normalString;
        }
        return currText.match(/^q'(.)/i)?.[0];
    };

    constructor(text: string, parser: Parser) {
        let token: Token = {
            start: parser.index
        };
        let contents: string;
        if (/q/i.test(text)) {
            let delimiter = text[text.length-1];
            delimiter = DELIMITER_PAIR[delimiter] ?? delimiter
            const match = parser.currText.match(new RegExp(`q'.([\\s\\S]*?)(?:${delimiter}'|($))`, 'i'));
            if (!match) {
                throw new Error('Invalid String');
            } 

            if (match[2] != null) {
                parser.problems.push({
                    start: token.start as number,
                    end: parser.text.length,
                    message: "Unterminated String Literal"
                })
            }
            token.text = match[0];
            parser.index += token.text.length;
            token.end = parser.index;
            contents = match[1]
        } else {
            const match = parser.currText.match(/^'((?:[^']|'')*)(?:'|($))/);

            if (!match) {
                throw new Error('Invalid String');
            } 
            
            if (match[2] != null) {
                parser.problems.push({
                    start: token.start as number,
                    end: parser.text.length,
                    message: "Unterminated String Literal"
                })
            }

            token.text = match[0];
            parser.index += token.text.length;
            token.end = parser.index;
            contents = match[1].replace(/''/g, "'");
        }
        super(token);

        this.stringContents = contents;
    }
}

class ParserHexString extends BaseLiteral {
    type: ParserType.HexString = ParserType.HexString;

    static match(currText: string) {
        return currText.match(/^x'/i)?.[0];
        // return currText.match(/^x'([^']|'')*('|$)/i)?.[0];
    };

}

const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}



const TYPE_CLASSES = [ParserInteger, ParserFixedPoint, ParserFloatingPoint, ParserString, ParserHexString]

export function literal(parser: Parser): Literal | null {
    let currText = parser.currText
    for (let i of TYPE_CLASSES) {
        const result = i.match(currText);
        if (result) {
            return new i(result, parser);
        }
    }

    return null
}