import * as vscode from "vscode";

export default function seeDiff() {
    vscode.commands.executeCommand('code -d webviews/components/Gradeable.svelte webviews/components/Course.svelte');
  }
  