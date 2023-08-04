import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser, statement} from '.';
import {BaseState, State} from './base';
import {REGULAR_IDENTIFIER} from './symbols';

export class Statement extends BaseState {

    subQuery: boolean;

    flush(state?: State) {
        this.parser.state.splice(this.parser.state.findIndex(el => el === state ?? this, 1))[0];
        this.parser.parsed.push(this);
        if (this.parser.index < this.parser.text.length && this.parser.state.length === 0) {
            this.parser.state.push(statement(this.parser));
        }
    }
    constructor(parser: Parser, start?: number, subQuery?: boolean) {
        super(parser, start);
        this.subQuery = !!subQuery;
    }
}


export class EmptyStatement extends Statement {
    parse = () => {
        this.parser.index++;
        this.end = this.parser.index;
        this.text = this.parser.text.substring(this.start, this.end);
        this.flush();
        if (this.parser.index < this.parser.text.length) {
            this.parser.state.push(new Statement(this.parser));
        }
    };

    constructor(parser: Parser, start?: number) {
        super(parser, start);
        this.parser.index++;
    }
}

export class UnknownStatement extends Statement {
    parse() {
        const token = this.parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}`))?.[0];
        const fullStatement = this.parser.currText.match(new RegExp(`[\\s\\S]+?(;|$${this.subQuery ? '|\\)' : ''})`))?.[0] ?? this.parser.currText;
        this.end = fullStatement.length;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.problems.push({
            start: this.start,
            end: this.end,
            severity: DiagnosticSeverity.Error,
            message: `Unknown Statement Type: ${token}`
        });
        this.flush();
    }
}
