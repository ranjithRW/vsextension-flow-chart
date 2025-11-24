import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';

/**
 * File information interface
 */
interface FileInfo {
    path: string;
    name: string;
    content: string;
    lineCount: number;
}

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
 * Converts multiple files into a Mermaid flowchart
 * @param files - Array of file information
 * @param folderName - Name of the folder
 * @returns Mermaid flowchart syntax as a string
 */
function convertFolderToFlowchart(files: FileInfo[], folderName: string): string {
    let mermaidCode = 'flowchart TD\n';
    
    // Start node
    mermaidCode += `    Start([Folder: ${folderName}]) --> Process1["${files.length} files found"]\n`;
    
    // Create nodes for each file
    files.forEach((file, index) => {
        const nodeId = `File${index}`;
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name;
        
        mermaidCode += `    Process1 --> ${nodeId}["${displayName}\\n${file.lineCount} lines"]\n`;
        
        // Add file details
        const detailId = `Detail${index}`;
        mermaidCode += `    ${nodeId} --> ${detailId}["Processed"]\n`;
    });
    
    // End node
    mermaidCode += '    ';
    files.forEach((_, index) => {
        mermaidCode += `Detail${index} --> `;
    });
    mermaidCode += 'End([End])\n';
    
    return mermaidCode;
}

/**
 * Checks if a path should be ignored
 */
function shouldIgnorePath(filePath: string): boolean {
    const ignorePatterns = [
        'node_modules',
        '.git',
        '.vscode',
        'out',
        'dist',
        'build',
        '.next',
        '.cache',
        'coverage',
        '.DS_Store',
        'package-lock.json',
        'yarn.lock',
        '.env',
        '.env.local'
    ];
    
    return ignorePatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Gets file extension
 */
function getFileExtension(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    return ext || 'no-ext';
}

/**
 * Recursively reads all files in a directory
 */
async function readFolderRecursive(folderPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const readdir = util.promisify(fs.readdir);
    const stat = util.promisify(fs.stat);
    const readFile = util.promisify(fs.readFile);
    
    async function processEntry(entryPath: string, relativePath: string): Promise<void> {
        if (shouldIgnorePath(entryPath)) {
            return;
        }
        
        const stats = await stat(entryPath);
        
        if (stats.isDirectory()) {
            const entries = await readdir(entryPath);
            for (const entry of entries) {
                await processEntry(path.join(entryPath, entry), path.join(relativePath, entry));
            }
        } else if (stats.isFile()) {
            // Only process text-based files
            const ext = getFileExtension(entryPath);
            const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.md', '.txt'];
            
            if (textExtensions.includes(ext) || ext === 'no-ext') {
                try {
                    const content = await readFile(entryPath, 'utf-8');
                    const lineCount = content.split('\n').length;
                    
                    files.push({
                        path: entryPath,
                        name: relativePath,
                        content: content,
                        lineCount: lineCount
                    });
                } catch (error) {
                    // Skip files that can't be read
                    console.warn(`Skipping file ${entryPath}: ${error}`);
                }
            }
        }
    }
    
    await processEntry(folderPath, path.basename(folderPath));
    return files;
}

/**
 * Gets the HTML content for the WebView panel
 * @param mermaidCode - The Mermaid flowchart code to render
 * @param webview - The WebView instance
 * @param extensionUri - The URI of the extension
 * @param fileCount - Optional number of files (for folder view)
 * @returns HTML string
 */
function getWebviewContent(mermaidCode: string, webview: vscode.Webview, extensionUri: vscode.Uri, fileCount?: number): string {
    // Get the path to the CSS file
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
    );

    const statsHtml = fileCount ? `<div class="stats">Processing ${fileCount} files</div>` : '';

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
        ${statsHtml}
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

    // Register the command for single file
    const disposable1 = vscode.commands.registerCommand('codeToFlowchart.generate', () => {
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
            `Code Flowchart - ${path.basename(document.fileName)}`,
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

    // Register the command for folder
    const disposable2 = vscode.commands.registerCommand('codeToFlowchart.generateFolder', async () => {
        // Get the workspace folder or selected folder
        let folderUri: vscode.Uri | undefined;
        
        // Check if a folder is selected in the explorer
        if (vscode.window.activeTextEditor) {
            const fileUri = vscode.window.activeTextEditor.document.uri;
            folderUri = vscode.Uri.joinPath(fileUri, '..');
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            folderUri = vscode.workspace.workspaceFolders[0].uri;
        } else {
            // Ask user to select a folder
            const selectedFolders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Folder'
            });
            
            if (!selectedFolders || selectedFolders.length === 0) {
                return;
            }
            
            folderUri = selectedFolders[0];
        }

        if (!folderUri) {
            vscode.window.showErrorMessage('No folder selected. Please select a folder.');
            return;
        }

        const folderPath = folderUri.fsPath;
        const folderName = path.basename(folderPath);

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Flowchart',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Reading folder...' });

            try {
                // Read all files in the folder
                const files = await readFolderRecursive(folderPath);
                
                if (files.length === 0) {
                    vscode.window.showWarningMessage('No code files found in the selected folder.');
                    return;
                }

                progress.report({ increment: 50, message: `Processing ${files.length} files...` });

                // Convert folder to flowchart
                const mermaidCode = convertFolderToFlowchart(files, folderName);

                progress.report({ increment: 100, message: 'Rendering flowchart...' });

                // Create and show a new WebView panel
                const panel = vscode.window.createWebviewPanel(
                    'codeToFlowchart',
                    `Code Flowchart - ${folderName}`,
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        localResourceRoots: [
                            vscode.Uri.joinPath(context.extensionUri, 'media')
                        ]
                    }
                );

                // Set the WebView content
                panel.webview.html = getWebviewContent(mermaidCode, panel.webview, context.extensionUri, files.length);

                // Handle panel disposal
                panel.onDidDispose(
                    () => {
                        // Clean up resources if needed
                    },
                    null,
                    context.subscriptions
                );

                vscode.window.showInformationMessage(`Flowchart generated for ${files.length} files in ${folderName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error generating flowchart: ${error}`);
            }
        });
    });

    context.subscriptions.push(disposable1, disposable2);
}

/**
 * Deactivates the extension
 */
export function deactivate() {
    // Clean up resources if needed
}

