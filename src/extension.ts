import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { posix } from 'path';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "submitty-extension",
      sidebarProvider,
      {
        retainContextWhenHidden: true
      }
    )
  );
  
  console.log('Congratulations, your extension "reddit-memes" is now active!');

  let disposable = vscode.commands.registerCommand(
    "submitty.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from reddit-memes!");
    }
  );


  const writeHandler = async (filename: string="sample_Write", content: string) => {
		if (!vscode.workspace.workspaceFolders) {
			return vscode.window.showInformationMessage('No folder or workspace opened');
		}

		const writeData = await Buffer.from(content, 'utf8');

		const folderUri = vscode.workspace.workspaceFolders[0].uri;
    var writePath = posix.join(folderUri.path, filename);
		const fileUri = folderUri.with({ path: writePath });

		await vscode.workspace.fs.writeFile(fileUri, writeData);

    let activePath : any;
    const {activeTextEditor} = vscode.window;
    activePath = activeTextEditor && activeTextEditor.document.uri.fsPath;

    if (!activePath) {
      return vscode.window.showInformationMessage('No folder or workspace opened');
    }

    vscode.commands.executeCommand ( 'vscode.diff', vscode.Uri.file(writePath), vscode.Uri.file(activePath));
  };

	vscode.commands.registerCommand('fs/readWriteFile', writeHandler);

  context.subscriptions.push(
    vscode.commands.registerCommand("reddit-memes.refreshWeb", async () => {
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand(
        "workbench.view.extension.submitty-extension-view"
      );
    })
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}
