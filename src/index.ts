import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, Diagnostic, Range } from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Parser } from './parser';

import util from 'util'
import * as inspector from 'node:inspector';

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | null;

documents.onDidOpen((event) => {
    connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document opened: ${event.document.uri}`);
    inspector.open(9229, '127.0.0.1');
    if (inspector.url()) {
        connection.console.log(`Inpector open on: ${inspector.url()}`);
    }
});

documents.onDidChangeContent((event) => {
    connection.console.log(`${new Date().toLocaleTimeString()} - Document changed ${event.document.uri}`);
    const res = new Parser(event.document);
    try {
        res.parse();      
        console.log(res);
        // try {
        //     connection.console.log(util.inspect(_parsed));
        // } catch (e: any) {
        //     connection.console.error(e?.message ?? e.toString());
        // }
        connection.sendDiagnostics({
            uri: event.document.uri,
            diagnostics: res.problems.map((prob => {
                const range = <Range>{start: event.document.positionAt(prob.start), end: event.document.positionAt(prob.end)};
                return <Diagnostic>{
                    severity: prob.severity,
                    range,
                    message: prob.message,
                };
            }))
        });
    } catch (e: any) {
        connection.console.error(e?.message ?? e.toString());
        throw e;
    }
});

documents.listen(connection);

connection.onInitialize((params) => {
    params.workspaceFolders?.forEach(workspaceFolder => {
        connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);
    });
    return {
        capabilities: {
            textDocumentSync: {
                openClose: true,
                change: TextDocumentSyncKind.Full
            },
            diagnosticProvider: {
                documentSelector: [
                    'sql',
                    {
                        'pattern': '*.sql'
                    }
                ],
                interFileDependencies: false,
                workspaceDiagnostics: false
            }
        }
    };
});

connection.listen();
