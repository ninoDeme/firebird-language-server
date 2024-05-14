import { Parser } from "../parser";
import { Context, Token } from "../parser/base";
import {
    CompletionItem,
    CompletionItemKind,
} from "vscode-languageserver-types";
import { ParserType } from "../parser/symbols";
import { SelectStatement } from "../parser/select";

export function complete(parser: Parser, cursor: number): CompletionItem[] {
    let stack = getStack(parser, cursor);
    let res: CompletionItem[] = [];
    for (const el of stack) {
        if (el.token.type === ParserType.SelectStatement) {
            const select = el.token as SelectStatement;
            if (select.from) {
                if (select.from.source?.alias) {
                    res.push({
                        label: select.from.source?.alias.text,
                        kind: CompletionItemKind.Class,
                    });
                }
                if (select.from.source?.type === ParserType.Table) {
                    res.push({
                        label: select.from.source.identifier!.text,
                        kind: CompletionItemKind.Class,
                    });
                }
                if (select.from.joins) {
                    for (let join of select.from.joins) {
                        if (join.source?.alias) {
                            res.push({
                                label: join.source?.alias.text,
                                kind: CompletionItemKind.Class,
                            });
                        }
                        if (join.source?.type === ParserType.Table) {
                            res.push({
                                label: join.source.identifier!.text,
                                kind: CompletionItemKind.Class,
                            });
                        }
                    }
                }
            }
        }
    }
    return res;
}

function isToken(value: unknown): value is Token {
    if (!value || typeof value !== "object") {
        return false;
    }
    if ("start" in value && "end" in value) {
        return true;
    }
    return false;
}

function getStack(parser: Parser, cursor: number): Context[] {
    let context: Context[] = [];
    for (let state of parser.parsed) {
        if (cursor > state.start && cursor <= state.end) {
            context = [{ token: state }];
            break;
        }
    }
    if (!context[0]) {
        context = [
            {
                token: parser.parsed[parser.parsed.length - 1],
            },
        ];
    }
    while (true) {
        let newContext: Context | null = null;
        loop: for (let [key, value] of Object.entries(
            context[context.length - 1].token,
        )) {
            if (key.startsWith("_")) {
                continue;
            }
            if (!value || typeof value !== "object") {
                continue;
            }
            let values: Token[] = [];
            if (Array.isArray(value)) {
                values = value.filter(isToken);
            }
            if (isToken(value)) {
                values = [value];
            }
            for (let token of values) {
                if (token.start < cursor) {
                    if (token.end >= cursor) {
                        newContext = {
                            token,
                            property: key,
                        };
                        break loop;
                    }
                    if (
                        token.start <= token.start &&
                        (!newContext || token.start >= newContext?.token.start)
                    ) {
                        newContext = {
                            token,
                            property: key,
                        };
                    }
                }
            }
        }
        if (!newContext) {
            break;
        }
        context.push(newContext);
    }

    return context;
}
