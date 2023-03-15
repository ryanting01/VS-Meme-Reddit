import * as vscode from "vscode";

export default function seeDiff() {
    console.log("HELLO");
    vscode.commands.executeCommand('code -d webviews/components/Gradeable.svelte webviews/components/Course.svelte');
  }
  