import * as vscode from 'vscode';
import { glob } from 'glob';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as fs from 'fs';

class DelayedFunc {
	private timeout: NodeJS.Timeout | undefined;

	constructor () {
		this.timeout = undefined;
	}

	/**
	 * Starts a time delayed execution of a function
	 * @param callback: The function to execute
	 * @param delay:	Delay before running, in ms
	 */
	public start(callback: (...args: any[]) => void, delay: number) {
		this.timeout = setTimeout(callback, delay);
	}

	/**
	 * Cancels the current delayed execution if one exists
	 */
	public cancel() {
		if(this.timeout)
		{
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}
}

const tempFile = path.join(__dirname, "temp.sp");

export function activate(context: vscode.ExtensionContext) {
	let throttles: { [key: string]: DelayedFunc } = {};
	function refreshDiagnostics(document: vscode.TextDocument, compilerDiagnostics: vscode.DiagnosticCollection) {
		const spcomp = vscode.workspace.getConfiguration("sourcePawnLinter").get<string>("pathToSpcomp") || "";
		if(!vscode.workspace.getConfiguration("sourcePawnLinter").get("pathToSpcomp") || (spcomp !== '' && !fs.existsSync(spcomp)))
		{
			vscode.window.showErrorMessage("Could not find spcomp! Make sure the path is correct.", "Open Settings").then((choice) => {
				if(choice === 'Open Settings') {
					vscode.commands.executeCommand("workbench.action.openWorkspaceSettings");
				}
			});
		}

		let throttle = throttles[document.uri.path];
		if(throttle === undefined)
		{
			throttle = new DelayedFunc;
			throttles[document.uri.path] = throttle;
		}

		throttle.cancel();
		throttle.start(function() {
			if(path.extname(document.fileName) === '.sp') {
				let diagnostics: vscode.Diagnostic[] = [];
				try {
					let file = fs.openSync(tempFile, "w", 0o765);
					fs.writeSync(file, document.getText());
					fs.closeSync(file);

					execFileSync(spcomp, [ "-i" + vscode.workspace.getConfiguration("sourcePawnLinter").get("includeDir") || "", "-v0", tempFile, "-oNUL" ]);
				} catch (error) {
					let regex = /\((\d+)+\) : ((error|fatal error|warning).+)/gm;
					let matches: RegExpExecArray | null;
					while(matches = regex.exec(error.stdout?.toString() || "")) {
						const range = new vscode.Range(new vscode.Position(Number(matches[1]) - 1, 0), new vscode.Position(Number(matches[1]) - 1, 256));
						const severity = matches[3] === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
						diagnostics.push(new vscode.Diagnostic(range, matches[2], severity));
					}
				}
		
				compilerDiagnostics.set(document.uri, diagnostics);
			}
		}, 300);
	}
	vscode.window.showInformationMessage("Starting SP Linter");

	let compilerDiagnostics = vscode.languages.createDiagnosticCollection("compiler");
	context.subscriptions.push(compilerDiagnostics);

	let activeEditorChanged = vscode.window.onDidChangeActiveTextEditor(editor => { 
		if(editor) {
			refreshDiagnostics(editor.document, compilerDiagnostics); 
		}
	});
	context.subscriptions.push(activeEditorChanged);

	let textDocumentChanged = vscode.workspace.onDidChangeTextDocument(event => {
			refreshDiagnostics(event.document, compilerDiagnostics);
	});
	context.subscriptions.push(textDocumentChanged);

	let textDocumentClosed = vscode.workspace.onDidCloseTextDocument(document => {
		compilerDiagnostics.delete(document.uri);
		delete throttles[document.uri.path];
	});
	context.subscriptions.push(textDocumentClosed);

	glob(path.join(vscode.workspace.workspaceFolders?.[0].uri.path || "", "**/include/sourcemod.inc"), (err, files) => {
        if (files.length === 0) {
            if (!vscode.workspace.getConfiguration("sourcePawnLinter").get("includeDir")) {
                vscode.window.showWarningMessage("SourceMod API not found in the project. You may need to set SourceMod Home for autocompletion to work", "Open Settings").then((choice) => {
                    if (choice === 'Open Settings') {
                        vscode.commands.executeCommand("workbench.action.openWorkspaceSettings");
                    }
                });
            }
        } else {
            if (!vscode.workspace.getConfiguration("sourcepawnLinter").get("includeDir")) {
                vscode.workspace.getConfiguration("sourcepawnLinter").update("includeDir", path.dirname(files[0]));
            }
        }
    });

	vscode.workspace.textDocuments.forEach(document => { refreshDiagnostics(document, compilerDiagnostics); });
}

export function deactivate() {
	try {
		fs.unlinkSync(tempFile);
	} catch {

	}
}