import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
    Diagnostic,
    Range,
    TextDocumentPositionParams,
    DocumentDiagnosticReportKind,
    DocumentDiagnosticReport,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./parser";

import * as inspector from "node:inspector";
import { Lexer } from "./parser/lexer";
import { CompletionItem } from "vscode-languageserver-types";
import { complete } from "./completion-provider";

let versionsMap: Map<string, Parser> = new Map();
// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.languages.diagnostics.on(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (document !== undefined) {
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: validateTextDocument(document),
        } satisfies DocumentDiagnosticReport;
    } else {
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: [],
        } satisfies DocumentDiagnosticReport;
    }
});

documents.onDidChangeContent((event) => {
    try {
        validateTextDocument(event.document)
    } catch (e: any) {
        connection.console.error(e?.message ?? e.toString());
        throw e;
    }
});

function validateTextDocument(document: TextDocument) {
    if (versionsMap.has(`${document.version}-${document.uri}`)) {
        return versionsMap.get(`${document.version}-${document.uri}`)!.problems.map((prob) => {
        const range = <Range>{
            start: document.positionAt(prob.start),
            end: document.positionAt(prob.end),
        };
        return <Diagnostic>{
            severity: prob.severity,
            range,
            message: prob.message,
        };
    });
    }
    const lexer = new Lexer(document);
    lexer.parse();
    const parser = new Parser(lexer);
    parser.parse();

    versionsMap.set(`${document.version}-${document.uri}`, parser);
    connection.onCompletion(
        (position: TextDocumentPositionParams): CompletionItem[] => {
            return complete(parser, document.offsetAt(position.position));
        },
    );
    return parser.problems.map((prob) => {
        const range = <Range>{
            start: document.positionAt(prob.start),
            end: document.positionAt(prob.end),
        };
        return <Diagnostic>{
            severity: prob.severity,
            range,
            message: prob.message,
        };
    });
}

connection.onInitialize((params) => {
    params.workspaceFolders?.forEach((workspaceFolder) => {
        connection.console.log(
            `[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`,
        );
    });
    inspector.open(9229, "127.0.0.1");
    if (inspector.url()) {
        connection.console.log(`Inpector open on: ${inspector.url()}`);
    }
    return {
        capabilities: {
            textDocumentSync: {
                openClose: true,
                change: TextDocumentSyncKind.Full,
            },
            completionProvider: {
                resolveProvider: false,
            },
            diagnosticProvider: {
                documentSelector: [
                    "sql",
                    {
                        pattern: "*.sql",
                    },
                ],
                identifier: "firebird",
                interFileDependencies: false,
                workspaceDiagnostics: false,
            },
        },
    };
});

documents.listen(connection);
connection.listen();
