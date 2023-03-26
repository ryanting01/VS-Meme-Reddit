import * as _vscode from'vscode';

declare global {
    const tsvscode: {
        postMessage: ({type:string, value: any}) => void;
        getState: ({
            gradeable:string,
            api_key:string,
            username:string
        }) => any;
        setState: (state: any) => void;
    };
}
