import {Parser} from '.';
import {State, Token} from './base';
import {SelectStatement} from './select';
import {TokenType} from './symbols';
import {ValueExpression} from './value-expression';

export interface ParenthesisBody extends State {
    insideParenthesis?: boolean;
}

export interface Paren extends State, Token, ParenthesisBody {
    body?: ParenthesisBody[];
    parseBody: () => void
}

export abstract class BaseParenthesis implements Paren {
    text!: string;
    start!: number;
    end!: number;

    parser: Parser;

    insideParenthesis?: boolean;
    parse() {
        if (this.parser.currToken.type === TokenType.RParen) {
            this.parser.index++;
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
        this.parseBody();

    };
    parseBody() {throw new Error('Unimplemented')};

    flush: () => void = () => {
        this.end = this.parser.currToken.end;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.state.splice(this.parser.state.findIndex(el => el === this, 1));
    };

    body?: ParenthesisBody[];
    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this.parser = parser;
        // this.body = body;
        // this.body.insideParenthesis = true;
    }
}

export class ExpressionParenthesis extends BaseParenthesis {
    parseBody() {
        const currToken = this.parser.currToken;
        if (currToken.type === TokenType.Comma) {
            this.parser.index++;
            let newExpression = new ValueExpression(this.parser)
            newExpression.insideParenthesis = true;
            this.body?.push(newExpression);
            this.parser.state.push(newExpression);
            return;
        }
        if (this.body?.[0]) {
            this.parser.problems.push({
                start: currToken.start,
                end: currToken.end,
                message: `Unknown Token: '${currToken.text}'`
            });
            return this.parser.index++
        } 
        if (currToken.text.toUpperCase() === 'SELECT') {
            this.body = [new SelectStatement(this.parser, undefined, true)];
            this.parser.state.push(this.body[0]);
            return;
        }
        let newExpression = new ValueExpression(this.parser)
        newExpression.insideParenthesis = true;
        this.body?.push(newExpression);
        this.parser.state.push(newExpression);
        return;
    }
}
