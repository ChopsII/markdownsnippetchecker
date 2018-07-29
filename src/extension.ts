'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs = require('fs');
import { AssertionError } from 'assert';
import * as bp from './breakpoint';


let defaultCPPArgs =
    [
        "/W4"
        , "/WX"
        , "/EHsc"
        , "/Ox"
        , "/std:c++latest"
        , "/permissive-"
        , "/I${workspaceRoot}"
        , "/IC:/Program Files (x86)/Microsoft Visual Studio/2017/Professional/VC/Tools/MSVC/14.14.26428/include"
        , "/Ic:/Program Files (x86)/Windows Kits/10/Include/10.0.16299.0/ucrt"
        , "/c"
        , "/nologo"
        , "/FC"
        , "/diagnostics:caret"
    ];


let snippetes_re = /\\?```[\w\W\n]*?```/g;
let escaped_snippet = /\\```[\w\W\n]*?```/g;
let language_re = /```(\w+)/;


function getLineNumber(text: string, index: number): number {
    let newlines_re = /\n/g;
    let match;
    let count = 1;
    while (match = newlines_re.exec(text)) {
        if (match.index > index) {
            break;
        }
        count++;
    }

    return count;
}

function writeTemporaryFile(snippetPath: string, snippet: string): boolean {
    try {

        fs.writeFileSync(snippetPath, snippet, { encoding: "utf8", flag: "w+" });
    }
    catch (err) {
        console.error(err);
        return false;
    }
    return true;
}

function getLanguage(snippet: string): string | undefined {

    let language_match = language_re.exec(snippet);
    if (!language_match) { return; }
    return language_match[1];
}

function cleanSnippet(snippet: string, doc: vscode.TextDocument, lineNumber: number): string {

    let linePragma = "#line " + (lineNumber + 1) + " \"" + doc.fileName + "\"";
    linePragma = linePragma.replace(/\\/g, "/");
    snippet = snippet.replace(/```cpp/, linePragma);
    snippet = snippet.replace(/```/g, "");
    return snippet;
}

function getSnippetPath(doc: vscode.TextDocument, snippet_count: number): string {
    let ws = vscode.workspace.getWorkspaceFolder(doc.uri);
    let path;
    if (ws) {
        path = ws;
    }
    else {
        path = doc.uri.fsPath.toString();
        path = path.replace(/[^\\]*$/, "");
    }
    return path + "/snippet-" + snippet_count + ".cpp";
}

function compileSnippet(snippetPath: string): string {
    let spawnSync = require('child_process').spawnSync;
    if (!spawnSync) { throw new AssertionError(spawnSync); }
    let args = defaultCPPArgs.concat(snippetPath);

    let community_cl_exe_path = 'C:/Program Files (x86)/Microsoft Visual Studio/2017/Community/VC/Tools/MSVC/14.14.26428/bin/Hostx64/x64/cl.exe';
    let professional_cl_exe_path = 'C:/Program Files (x86)/Microsoft Visual Studio/2017/Professional/VC/Tools/MSVC/14.14.26428/bin/Hostx64/x64/cl.exe';

    var result = spawnSync(professional_cl_exe_path,
        [...args
        ],
        {});

    let resultString = String(result.stdout);
    let std_err = String(result.stderr).trim();
    if (result.error) {
        console.error(result.error);
        return std_err;
    }
    if (result.status !== 0) {
        if (std_err !== "") {
            console.error(std_err);
            return std_err;
        }
        console.log('Compiler output: """', resultString, '"""');
        return resultString;
        //process.exit(result.status);
    } else {
        console.log(resultString);
        bp.errorBreak(std_err);
    }
    return "";
}

function makeErrorDiagnostic(error: RegExpExecArray, doc: vscode.TextDocument): vscode.Diagnostic {
    let severity = vscode.DiagnosticSeverity.Error;
    let message = error[4];
    let range = new vscode.Range(doc.lineAt(parseInt(error[2]) - 1).range.start.translate(0, parseInt(error[3]) - 1), doc.lineAt(parseInt(error[2]) - 1).range.start.translate(0, parseInt(error[3]) - 1));
    console.error("Found error line: ", error[0]);
    return new vscode.Diagnostic(range, message, severity);
}

function makeFatalErrorDiagnostic(fatal_error: RegExpExecArray, doc: vscode.TextDocument): vscode.Diagnostic | undefined {
    let severity = vscode.DiagnosticSeverity.Error;
    let message = fatal_error[0];
    let range: vscode.Range;

    console.log("Found fatal error line: ", fatal_error[0]);
    if (fatal_error[3]) {
        range = new vscode.Range(doc.lineAt(parseInt(fatal_error[3]) - 1).range.start.translate(0, parseInt(fatal_error[4]) - 1), doc.lineAt(parseInt(fatal_error[3]) - 1).range.start.translate(0, parseInt(fatal_error[4]) - 1));
        return new vscode.Diagnostic(range, message, severity);
    } else {
        range = new vscode.Range(doc.positionAt(0), doc.positionAt(0));
        return undefined;//
    }
}

function makeWarningDiagnostic(warning: RegExpExecArray, doc: vscode.TextDocument): vscode.Diagnostic {
    let severity = vscode.DiagnosticSeverity.Warning;
    let message = warning[4];
    let range = new vscode.Range(doc.lineAt(parseInt(warning[2]) - 1).range.start.translate(0, parseInt(warning[3]) - 1), doc.lineAt(parseInt(warning[2]) - 1).range.start.translate(0, parseInt(warning[3]) - 1));
    console.warn("Found warning line: ", warning[0]);
    return new vscode.Diagnostic(range, message, severity);
}

function makeNoteDiagnostic(note: RegExpExecArray, doc: vscode.TextDocument, lastDiag: vscode.Diagnostic): vscode.Diagnostic | undefined {
    if (note[1].toLowerCase() === doc.fileName.toLowerCase()) {
        let severity = vscode.DiagnosticSeverity.Information;
        let range = new vscode.Range(doc.lineAt(parseInt(note[2]) - 1).range.start.translate(0, parseInt(note[3]) - 1), doc.lineAt(parseInt(note[2]) - 1).range.start.translate(0, parseInt(note[3]) - 1));
        let message = note[4];
        console.log("Found info line: ", note[0]);

        lastDiag.relatedInformation = [];
        lastDiag.relatedInformation.push(new vscode.DiagnosticRelatedInformation(new vscode.Location(doc.uri, range.start), message));

        return undefined; //new vscode.Diagnostic(range, message, severity);
    }
    else {
        lastDiag.message += "\n" + note[0];
        console.log("Found continuation of previous line: ", note[0]);
    }
}

function makeUnknownDiagnostic(unknown: RegExpExecArray, doc: vscode.TextDocument): vscode.Diagnostic {
    let severity = vscode.DiagnosticSeverity.Error;
    let message = unknown[5];
    let range = new vscode.Range(doc.lineAt(parseInt(unknown[2]) - 1).range.start.translate(0, parseInt(unknown[3]) - 1), doc.lineAt(parseInt(unknown[2]) - 1).range.start.translate(0, parseInt(unknown[3]) - 1));
    bp.errorBreak("Found unknown: ", unknown[0]);
    return new vscode.Diagnostic(range, message, severity);
}

function parseResults(doc: vscode.TextDocument, resultString: string): vscode.Diagnostic[] {
    let diagnostics: vscode.Diagnostic[] = [];
    let lines = resultString.split(/\r?\n/g);
    console.assert(lines);
    let error_re = /(.*[^\(\)]*)\(([0-9]+),?([0-9]*)\): error C[0-9][0-9][0-9][0-9]+: (.*)/;
    let warning_re = /(.*[^\(\)]*)\(([0-9]+),?([0-9]*)\): warning C[0-9][0-9][0-9][0-9]+: (.*)/;
    let note_re = /(.*[^\(\)]*)\(([0-9]+),?([0-9]*)\): note: (.*)/;
    let fatal_error_re = /^([^\(\)]*)(\(([0-9]+),?([0-9]*)\))? ?: fatal error C[0-9][0-9][0-9][0-9]+: (.*)/;
    let unknown_re = /(.*[^\(\)]*)\(([0-9]+),?([0-9]*)\): ([^:]*): (.*)/;

    let fileNameLeaf = "";
    let diag: vscode.Diagnostic | undefined;

    lines.forEach((line, lineCount) => {
        try {
            let error = error_re.exec(line);
            let warning = warning_re.exec(line);
            let note = note_re.exec(line);
            let fatal_error = fatal_error_re.exec(line);
            let unknown = unknown_re.exec(line);
            let lastDiag: vscode.Diagnostic | undefined;
            if (diagnostics.length > 0) {
                lastDiag = diagnostics[diagnostics.length - 1];
            }

            if (error) {
                diag = makeErrorDiagnostic(error, doc);
            } else if (fatal_error) {
                diag = makeFatalErrorDiagnostic(fatal_error, doc);
            } else if (warning) {
                diag = makeWarningDiagnostic(warning, doc);
            } else if (note) {
                if (!lastDiag) {
                    bp.errorBreak("lastDiag not found");
                } else {
                    diag = makeNoteDiagnostic(note, doc, lastDiag);
                }
            } else if (unknown) {
                diag = makeUnknownDiagnostic(unknown, doc);
            } else {
                if (fileNameLeaf === "") {
                    fileNameLeaf = line;
                    console.log("Found new TU: ", line);
                    return;
                } else if (line === "") {
                    console.log("Found end of TU diagnostics");
                    fileNameLeaf = "";
                } else {
                    console.log("Found extension of existing message: ", line);
                    if (!lastDiag) {
                        bp.errorBreak("lastDiag not found");
                    } else {
                        lastDiag.message += "\n" + line;
                    }
                }
            }
            if (diag) {
                diag.source = "markdownsnippetchecker";

                console.log("Pushing diag: ", diag);
                diagnostics.push(diag);
                diag = undefined;
            }
        } catch (err) {
            bp.errorBreak("wat3: ", err);
        }
    });
    return diagnostics;
}

function checkSnippets() {
    try {
        let ed = vscode.window.activeTextEditor;

        let diagnosticCollection = vscode.languages.createDiagnosticCollection("snippet-checker");

        let diagnostics: vscode.Diagnostic[] = [];
        if (ed) {
            let doc = ed.document;
            let text = doc.getText();
            let match;
            let snippet_count = 0;
            while (match = snippetes_re.exec(text)) {
                let snippet = match[0];
                if (escaped_snippet.exec(snippet)) {
                    continue;
                }
                snippet_count++;
                let language = getLanguage(snippet);
                if (language !== "cpp") { continue; }
                let lineNumber = getLineNumber(text, match.index);

                snippet = cleanSnippet(snippet, doc, lineNumber);
                console.log(snippet);

                let snippetPath = getSnippetPath(doc, snippet_count);

                //TODO save snippet to temporary file
                if (!writeTemporaryFile(snippetPath, snippet)) { break; }

                //TODO compile with warnings
                let resultString = compileSnippet(snippetPath);

                //TODO report problem with snippet  
                let resultDiagnostics = parseResults(doc, resultString);
                diagnostics = diagnostics.concat(resultDiagnostics);

                //TODO report problems back to user
                //TODO delete temporary file
                while (true) {
                    try {
                        fs.unlinkSync(snippetPath);
                        break;
                    } catch (err) {
                        console.error("Couldn't unlink: ", err);
                    }
                }

                //TODO configurable compiler path
                //TODO configurable compiler args

            }
            diagnosticCollection.clear();
            diagnosticCollection.set(doc.uri, diagnostics);
        }
    } catch (err) {
        console.error("wat4: ", err);
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "markdowncodesnippetchecker" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.checkSnippets', checkSnippets);

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}