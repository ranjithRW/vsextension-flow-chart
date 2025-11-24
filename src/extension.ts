import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Converts code string into a Mermaid flowchart
 * @param code - The source code to convert
 * @returns Mermaid flowchart syntax as a string
 */
function convertToFlowchart(code: string): string {
    // Simple placeholder implementation
    // This can be replaced with a real parser or AI-based conversion later
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    const lineCount = lines.length;
    
    // Generate a simple flowchart structure
    let mermaidCode = 'flowchart TD\n';
    mermaidCode += '    Start([Start]) --> Process1["Code parsed"]\n';
    mermaidCode += `    Process1 --> Process2["${lineCount} lines of code"]\n`;
    mermaidCode += '    Process2 --> End([End])\n';
    
    return mermaidCode;
}

/**
 * Gets the HTML content for the WebView panel
 * @param mermaidCode - The Mermaid flowchart code to render
 * @param webview - The WebView instance
 * @param extensionUri - The URI of the extension
 * @returns HTML string
 */
function getWebviewContent(mermaidCode: string, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    // Get the path to the CSS file
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Flowchart</title>
    <link href="${styleUri}" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
    <div class="container">
        <h1>Code Flowchart</h1>
        <div class="mermaid">
${mermaidCode}
        </div>
    </div>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis'
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Activates the extension
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Code to Flowchart extension is now active!');

    // Register the command
    const disposable = vscode.commands.registerCommand('codeToFlowchart.generate', () => {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open a file first.');
            return;
        }

        // Get the document
        const document = editor.document;
        
        // Read the entire file content
        const code = document.getText();
        
        if (!code || code.trim().length === 0) {
            vscode.window.showWarningMessage('The active file is empty.');
            return;
        }

        // Convert code to flowchart
        const mermaidCode = convertToFlowchart(code);

        // Create and show a new WebView panel
        const panel = vscode.window.createWebviewPanel(
            'codeToFlowchart',
            'Code Flowchart',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        // Set the WebView content
        panel.webview.html = getWebviewContent(mermaidCode, panel.webview, context.extensionUri);

        // Handle panel disposal
        panel.onDidDispose(
            () => {
                // Clean up resources if needed
            },
            null,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

/**
 * Deactivates the extension
 */
export function deactivate() {
    // Clean up resources if needed
}

