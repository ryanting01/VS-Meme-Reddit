import * as vscode from "vscode";
import getNonce from "./getNonce";
// import global from "../webviews/globals";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  settingsSet = false;
  // tsvscode: any;

  constructor(private readonly _extensionUri: vscode.Uri) { }

  

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: {
      title: any; type: any; value: string; }) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          vscode.window.showInformationMessage(data.value + "HI");
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case "diff": {
          let activePath : any;
          const {activeTextEditor} = vscode.window;
          activePath = activeTextEditor && activeTextEditor.document.uri.fsPath;
          // vscode.window.showInformationMessage(data.value + activePath);
          vscode.window.showInformationMessage("HELLO");
          this.diff(activePath, activePath);
        }
        case "writeAndDiff": {
          vscode.commands.executeCommand("fs/readWriteFile", data.title, data.value);
        }
        case "getSettings": {
          // if (!this.settingsSet) {
            // launch.json configuration
            const config = vscode.workspace.getConfiguration(
              'launch',
              vscode.workspace.workspaceFolders[0].uri
            );
            // retrieve values
            const values = config.get('configurations');
            this._view.webview.postMessage({
              command: 'launchOptions',
              course: values[0].course,
              gradeable: values[0].gradeable
            });
            this.settingsSet=true;
          // }
        }
      //   case "submitFileOpen": {
      //     let activePath : any;
      //     const {activeTextEditor} = vscode.window;
      //     activePath = activeTextEditor && activeTextEditor.document.uri.fsPath;
      //     // vscode.window.showInformationMessage(activePath);
      //     // vscode.window.showInformationMessage(activeTextEditor.document);
      //     vscode.window.showInformationMessage("HELLO THERE");
      //   }
      }
    });

  }

  public diff ( leftPath: string, rightPath: string ) {
    const leftUri = vscode.Uri.file ( leftPath ),
          rightUri = vscode.Uri.file ( rightPath );
    return vscode.commands.executeCommand ( 'vscode.diff', leftUri, rightUri );
  }  

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {

    // this.tsvscode = acquireVsCodeApi();
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "global.css")
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "compiled/sidebar.js")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "compiled/sidebar.css")
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content=" img-src https: data: ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">
        <script nonce="${nonce}">
          tsvscode = acquireVsCodeApi();
        </script>
			</head>
      <body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}
