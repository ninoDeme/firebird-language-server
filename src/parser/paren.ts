import {Parser} from '.';
import {State, Token} from './base';
import {SelectStatement} from './select';
import {LexerType, ParserType} from './symbols';
import {ValueExpression, ValueExpressionFactory} from './value-expression';

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
    type = ParserType.Parenthesis

    parser: Parser;

    insideParenthesis?: boolean;
    parse() {
        if (this.parser.currToken.type === LexerType.RParen) {
            return this.flush();
        }
        if (this.parser.currToken.type === LexerType.EOF || this.parser.currToken.type === LexerType.DotColon) {
            this.parser.problems.push({
                start: this.start,
                end: this.parser.currToken.end,
                message: `Unterminated Parenthesis`
            });
            this.parser.index--;
            return this.flush();
        }
        this.parseBody();

    };
    parseBody() {throw new Error('Unimplemented')};

    flush: () => void = () => {
        this.end = this.parser.currToken.end;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.state.splice(this.parser.state.findIndex(el => el === this, 1));
        this.parser.index++;
    };

    body: (ParenthesisBody & ValueExpression)[] = [];
    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this.parser = parser;
        this.parser.index++;
    }
}

export class ExpressionParenthesis extends BaseParenthesis {
    type = ParserType.ExpressionParenthesis
    parseBody() {
        if (!this.body) throw new Error("Body is null?");
        const currToken = this.parser.currToken;
        if (currToken.type === LexerType.Comma) {
            this.parser.index++;
            let newExpression = new ValueExpressionFactory(this.parser, (b) => this.body!.push(b))
            newExpression.insideParenthesis = true;
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
        let newExpression = new ValueExpressionFactory(this.parser, (b) => this.body!.push(b))
        newExpression.insideParenthesis = true;
        this.parser.state.push(newExpression);
        return;
    }
}
