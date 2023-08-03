import {Parser} from '.';
import {BaseLiteral, Literal, SQlType} from './base';

class SQLInteger extends BaseLiteral {
    type: SQlType.Integer = SQlType.Integer;

    static match(currText: string) {
        return currText.match(/^0x(?:[\da-f]{2})+/i)?.[0] || currText.match(/^-?\d+(?!\.)/)?.[0];
    };

}

class SQLFixedPoint extends BaseLiteral {
    type: SQlType.FixedPoint = SQlType.FixedPoint;

    static match(currText: string) {
        return currText.match(/^-?\d+?\.\d+(?!e\d+)/i)?.[0];
    };
}

class SQLFloatingPoint extends BaseLiteral {
    type: SQlType.FloatingPoint = SQlType.FloatingPoint;

    static match(currText: string) {
        return currText.match(/^\d+?\.\d+e-?\d+/i)?.[0];
    };
}

class SQLString extends BaseLiteral {
    type: SQlType.String = SQlType.String;

    static match(currText: string) {
        const normalString = currText.match(/^'((?:[^']|'')*)'/)?.[0];
        if (normalString) {
            return normalString;
        }
        let delimiter = currText.match(/^q'(.)/i)?.[1];
        if (delimiter) {
            delimiter = DELIMITER_PAIR[delimiter] ?? delimiter
            return currText.match(new RegExp(`q'.[\\s\\S]*?${delimiter}'`, 'i'))?.[0];
        }
    };
}

const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}



const TYPE_CLASSES = [SQLInteger, SQLFixedPoint, SQLFloatingPoint]

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