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

    _parser: Parser;

    insideParenthesis?: boolean;
    parse() {
        if (this._parser.currToken.type === LexerType.RParen) {
            return this.flush();
        }
        if (this._parser.currToken.type === LexerType.EOF || this._parser.currToken.type === LexerType.DotColon) {
            this._parser.problems.push({
                start: this.start,
                end: this._parser.currToken.end,
                message: `Unterminated Parenthesis`
            });
            this._parser.index--;
            return this.flush();
        }
        this.parseBody();

    };
    parseBody() {throw new Error('Unimplemented')};

    flush: () => void = () => {
        this.end = this._parser.currToken.end;
        this.text = this._parser.text.substring(this.start, this.end);
        this._parser.state.splice(this._parser.state.findIndex(el => el === this, 1));
        this._parser.index++;
    };

    body: (ParenthesisBody & ValueExpression)[] = [];
    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this._parser = parser;
        this._parser.index++;
    }
}

export class ExpressionParenthesis extends BaseParenthesis {
    type = ParserType.ExpressionParenthesis
    parseBody() {
        if (!this.body) throw new Error("Body is null?");
        const currToken = this._parser.currToken;
        if (currToken.type === LexerType.Comma) {
            this._parser.index++;
            let newExpression = new ValueExpressionFactory(this._parser, (b) => this.body!.push(b))
            newExpression.insideParenthesis = true;
            this._parser.state.push(newExpression);
            return;
        }
        if (this.body?.[0]) {
            this._parser.problems.push({
                start: currToken.start,
                end: currToken.end,
                message: `Unknown Token: '${currToken.text}'`
            });
            return this._parser.index++
        } 
        if (currToken.text.toUpperCase() === 'SELECT') {
            this.body = [new SelectStatement(this._parser, undefined, true)];
            this._parser.state.push(this.body[0]);
            return;
        }
        let newExpression = new ValueExpressionFactory(this._parser, (b) => this.body!.push(b))
        newExpression.insideParenthesis = true;
        this._parser.state.push(newExpression);
        return;
    }
}
