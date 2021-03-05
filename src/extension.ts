// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { workspace, window, languages, commands } from 'vscode';
import * as vscode from 'vscode';
import { glob } from 'glob';
import * as path from 'path';
import { execSync } from 'child_process';

let timeout: NodeJS.Timeout | undefined = undefined;

function refreshDiagnostics(document: vscode.TextDocument, context: vscode.DiagnosticCollection) {
	if(timeout)
	{
		clearTimeout(timeout);
		timeout = undefined;
	}

	timeout = setTimeout(function() {
		if(path.extname(document.fileName) === '.sp') {
			let diagnostics: vscode.Diagnostic[] = [];
			try {
				execSync(__dirname + "/../spcomp.exe -i" + workspace.getConfiguration("sourcePawnLinter").get("includeDir") + " --dry-run " + document.uri.fsPath);
			} catch (error) {
				let regex = /\((\d+)+\) : ((error|fatal error|warning).+)/gm;
				let matches: RegExpExecArray | null;
				while(matches = regex.exec(error.stderr?.toString() ?? "")) {
					let range = new vscode.Range(new vscode.Position(Number(matches[1]) - 1, 0), new vscode.Position(Number(matches[1]) - 1, 200));
					let severity = matches[3] === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
					diagnostics.push(new vscode.Diagnostic(range, matches[2], severity));
				}
			}
	
			context.set(document.uri, diagnostics);
		}
	}, 100);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let compilerDiagnostics = languages.createDiagnosticCollection("compiler");
	context.subscriptions.push(compilerDiagnostics);

	if(window.activeTextEditor) {
		refreshDiagnostics(window.activeTextEditor.document, compilerDiagnostics);
	}

	let activeTextEditorChanged = window.onDidChangeActiveTextEditor(editor => { 
		if(editor) {
			refreshDiagnostics(editor.document, compilerDiagnostics); 
		}
	});
	context.subscriptions.push(activeTextEditorChanged);

	let textDocumentChanged = workspace.onDidChangeTextDocument(event => {
			refreshDiagnostics(event.document, compilerDiagnostics);
	});
	context.subscriptions.push(textDocumentChanged);

	let textDocumentClosed = workspace.onDidCloseTextDocument(document => {
		compilerDiagnostics.delete(document.uri);
	});
	context.subscriptions.push(textDocumentClosed);

	glob(path.join(workspace.workspaceFolders?.[0].uri.path ?? "", "**/include/sourcemod.inc"), (err, files) => {
        if (files.length === 0) {
            if (!workspace.getConfiguration("sourcePawnLinter").get("includeDir")) {
                window.showWarningMessage("SourceMod API not found in the project. You may need to set SourceMod Home for autocompletion to work", "Open Settings").then((choice) => {
                    if (choice === 'Open Settings') {
                        commands.executeCommand("workbench.action.openWorkspaceSettings");
                    }
                });
            }
        } else {
            if (!workspace.getConfiguration("sourcepawnLinter").get("includeDir")) {
                workspace.getConfiguration("sourcepawnLinter").update("includeDir", path.dirname(files[0]));
            }
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}
