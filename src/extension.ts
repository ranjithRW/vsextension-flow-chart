import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { spawn } from 'child_process';
import { promisify } from 'util';

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
    // Build a richer Mermaid graph: each file is a subgraph containing functions/classes
    // and edges are created for resolved relative imports; external packages are shown as external nodes.
    const text = files;

    function makeId(s: string) {
        return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
    }

    function extractImportsAndSymbols(content: string) {
        const imports: string[] = [];
        const functions: string[] = [];
        const classes: string[] = [];

        const importRe = /import\s+(?:[^'";]+from\s+)?['"]([^'"]+)['"];?/g;
        let m: RegExpExecArray | null;
        while ((m = importRe.exec(content)) !== null) {
            imports.push(m[1]);
        }

        const requireRe = /require\(['"]([^'"]+)['"]\)/g;
        while ((m = requireRe.exec(content)) !== null) {
            imports.push(m[1]);
        }

        const functionRe = /function\s+([a-zA-Z0-9_]+)\s*\(|const\s+([a-zA-Z0-9_]+)\s*=\s*\(?\s*\)?\s*=>/g;
        while ((m = functionRe.exec(content)) !== null) {
            const name = m[1] || m[2];
            if (name) functions.push(name);
        }

        const classRe = /class\s+([a-zA-Z0-9_]+)/g;
        while ((m = classRe.exec(content)) !== null) {
            classes.push(m[1]);
        }

        return { imports, functions, classes };
    }

    function resolveImport(fromFile: string, imp: string): string | null {
        if (imp.startsWith('.') || imp.startsWith('/')) {
            const base = path.resolve(path.dirname(fromFile), imp);
            const candidates = [base, base + '.ts', base + '.js', base + '.tsx', base + '.jsx', path.join(base, 'index.ts'), path.join(base, 'index.js')];
            for (const c of candidates) {
                try {
                    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
                } catch (e) {
                    // ignore
                }
            }
        }
        return null;
    }

    const nodes: { file: FileInfo; imports: string[]; functions: string[]; classes: string[] }[] = [];
    for (const f of text) {
        const { imports, functions, classes } = extractImportsAndSymbols(f.content);
        nodes.push({ file: f, imports, functions, classes });
    }

    const byResolvedPath = new Map<string, typeof nodes[0]>();
    for (const n of nodes) {
        byResolvedPath.set(path.resolve(n.file.path), n);
    }

    let mermaidCode = 'flowchart TD\n';

    // Create subgraphs for files
    for (const n of nodes) {
        const id = makeId(n.file.name);
        mermaidCode += `    subgraph ${id}[${n.file.name}]\n`;
        for (const fn of n.functions.slice(0, 8)) {
            const nid = makeId(n.file.name + '_' + fn);
            mermaidCode += `        ${nid}["fn: ${fn}"]\n`;
        }
        for (const c of n.classes.slice(0, 8)) {
            const cid = makeId(n.file.name + '_' + c);
            mermaidCode += `        ${cid}["class: ${c}"]\n`;
        }
        // fallback node when no symbols found
        if (n.functions.length === 0 && n.classes.length === 0) {
            mermaidCode += `        ${id}_file["${path.basename(n.file.name)}\\n${n.file.lineCount} lines"]\n`;
        }
        mermaidCode += '    end\n';
    }

    // Create edges for imports
    // Track incoming/outgoing edges to identify entry and leaf files
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const n of nodes) {
        const fromId = makeId(n.file.name);
        outgoing.set(fromId, 0);
        incoming.set(fromId, incoming.get(fromId) || 0);
    }

    // Build adjacency for topological ordering and also render import edges
    const adjacency = new Map<string, Set<string>>();
    for (const n of nodes) {
        const fromId = makeId(n.file.name);
        if (!adjacency.has(fromId)) adjacency.set(fromId, new Set());
        for (const imp of n.imports) {
            const resolved = resolveImport(n.file.path, imp);
            if (resolved) {
                const target = byResolvedPath.get(path.resolve(resolved));
                if (target) {
                    const toId = makeId(target.file.name);
                    mermaidCode += `    ${fromId} --> ${toId}\n`;
                    adjacency.get(fromId)!.add(toId);
                    outgoing.set(fromId, (outgoing.get(fromId) || 0) + 1);
                    incoming.set(toId, (incoming.get(toId) || 0) + 1);
                }
            } else {
                if (!imp.startsWith('.')) {
                    const extId = makeId('ext_' + imp);
                    mermaidCode += `    ${fromId} --> ${extId}["${imp}"]\n`;
                    adjacency.get(fromId)!.add(extId);
                    outgoing.set(fromId, (outgoing.get(fromId) || 0) + 1);
                }
            }
        }
    }

    // Compute a topological-like ordering for files to present a pipeline backbone
    const inDegreeMap = new Map<string, number>();
    for (const [k, v] of incoming.entries()) inDegreeMap.set(k, v || 0);
    // Ensure all nodes present
    for (const id of adjacency.keys()) if (!inDegreeMap.has(id)) inDegreeMap.set(id, 0);

    const q: string[] = [];
    for (const [id, deg] of inDegreeMap.entries()) {
        if ((deg || 0) === 0 && id && id !== '') q.push(id);
    }

    const topoOrder: string[] = [];
    while (q.length > 0) {
        const cur = q.shift()!;
        topoOrder.push(cur);
        const neigh = adjacency.get(cur);
        if (!neigh) continue;
        for (const nb of neigh) {
            const curDeg = inDegreeMap.get(nb) || 0;
            inDegreeMap.set(nb, curDeg - 1);
            if (curDeg - 1 === 0) q.push(nb);
        }
    }

    // If topoOrder doesn't include all (due to cycles), append remaining nodes
    if (topoOrder.length < nodes.length) {
        for (const n of nodes) {
            const id = makeId(n.file.name);
            if (!topoOrder.includes(id)) topoOrder.push(id);
        }
    }

    // Add a dashed pipeline backbone connecting topologically ordered files (limited to avoid clutter)
    const MAX_PIPE_NODES = 200;
    const pipelineNodes = topoOrder.slice(0, Math.min(topoOrder.length, MAX_PIPE_NODES));
    for (let i = 0; i < pipelineNodes.length - 1; i++) {
        mermaidCode += `    ${pipelineNodes[i]} -.-> ${pipelineNodes[i + 1]}\n`;
    }

    // Add Start and End nodes to show overall flow from entry points to leaves
    const startId = 'StartNode';
    const endId = 'EndNode';
    mermaidCode += `    ${startId}([Start])\n`;
    mermaidCode += `    ${endId}([End])\n`;

    // Entry files: files with zero incoming edges
    for (const n of nodes) {
        const id = makeId(n.file.name);
        if (!incoming.get(id) || incoming.get(id) === 0) {
            mermaidCode += `    ${startId} --> ${id}\n`;
        }
    }

    // Leaf files: files with zero outgoing edges
    for (const n of nodes) {
        const id = makeId(n.file.name);
        if (!outgoing.get(id) || outgoing.get(id) === 0) {
            mermaidCode += `    ${id} --> ${endId}\n`;
        }
    }

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
        <div id="diagramArea">
            <div class="mermaid" id="mermaidChart">
${mermaidCode}
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; align-items:center;">
                <button id="exportSvgBtn">Show SVG Image / Download</button>
                <a id="downloadLink" style="display:none;">Download SVG</a>
            </div>
            <div id="svgImageContainer" style="margin-top:12px;"></div>
        </div>
    </div>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            maxTextSize: 1000000,
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis'
            }
        });

        // After Mermaid renders the chart, provide an SVG image view and download link
        function findRenderedSVG() {
            const container = document.getElementById('mermaidChart');
            if (!container) return null;
            // Mermaid replaces the container content with an SVG element
            const svg = container.querySelector('svg');
            return svg;
        }

        function serializeSvg(svg) {
            // Inline external fonts/styles if needed (best-effort)
            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svg);
            // Add name space
            if(!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            // Add xml declaration
            source = '<?xml version="1.0" standalone="no"?>\n' + source;
            return source;
        }

        function toBase64(str) {
            return window.btoa(unescape(encodeURIComponent(str)));
        }

        document.getElementById('exportSvgBtn').addEventListener('click', () => {
            const svg = findRenderedSVG();
            if (!svg) {
                alert('SVG not yet rendered — try again in a second.');
                return;
            }

            const svgText = serializeSvg(svg);
            const base64 = toBase64(svgText);
            const dataUrl = 'data:image/svg+xml;base64,' + base64;

            // Display as image
            const container = document.getElementById('svgImageContainer');
            container.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.maxWidth = '100%';
            img.style.border = '1px solid rgba(255,255,255,0.05)';
            container.appendChild(img);

            // Prepare download link
            const downloadLink = document.getElementById('downloadLink');
            downloadLink.href = dataUrl;
            downloadLink.download = 'wholeflow.svg';
            downloadLink.textContent = 'Download SVG';
            downloadLink.style.display = 'inline-block';
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
    // Default `Generate Flow Chart` now produces a workspace-level diagram (scans project root).
    const disposable1 = vscode.commands.registerCommand('codeToFlowchart.generate', async () => {
        // Determine workspace folder (prefer root)
        let folderUri: vscode.Uri | undefined;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            folderUri = vscode.workspace.workspaceFolders[0].uri;
        } else if (vscode.window.activeTextEditor) {
            const fileUri = vscode.window.activeTextEditor.document.uri;
            folderUri = vscode.Uri.joinPath(fileUri, '..');
        } else {
            const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
            if (!selected || selected.length === 0) return;
            folderUri = selected[0];
        }

        if (!folderUri) {
            vscode.window.showErrorMessage('No folder found to scan.');
            return;
        }

        const folderPath = folderUri.fsPath;
        const folderName = path.basename(folderPath);

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating Flowchart (Workspace)', cancellable: false }, async (progress) => {
            progress.report({ increment: 0, message: 'Reading folder...' });
            try {
                const files = await readFolderRecursive(folderPath);
                if (files.length === 0) {
                    vscode.window.showWarningMessage('No code files found in the selected folder.');
                    return;
                }
                progress.report({ increment: 50, message: `Processing ${files.length} files...` });
                const mermaidCode = convertFolderToFlowchart(files, folderName);
                progress.report({ increment: 100, message: 'Rendering flowchart...' });

                const panel = vscode.window.createWebviewPanel('codeToFlowchart', `Code Flowchart - ${folderName}`, vscode.ViewColumn.Beside, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] });
                panel.webview.html = getWebviewContent(mermaidCode, panel.webview, context.extensionUri, files.length);
                panel.onDidDispose(() => { }, null, context.subscriptions);
                vscode.window.showInformationMessage(`Flowchart generated for ${files.length} files in ${folderName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error generating flowchart: ${error}`);
            }
        });
    });

    // Register the command for folder
    const disposable2 = vscode.commands.registerCommand('codeToFlowchart.generateFolder', async () => {
        // Prefer the workspace root (scan whole project). Fall back to active file's folder or ask the user.
        let folderUri: vscode.Uri | undefined;

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            // Use the first workspace folder as the project root
            folderUri = vscode.workspace.workspaceFolders[0].uri;
        } else if (vscode.window.activeTextEditor) {
            // Fallback to the folder of the active file
            const fileUri = vscode.window.activeTextEditor.document.uri;
            folderUri = vscode.Uri.joinPath(fileUri, '..');
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

    // Register the command to generate and save SVG directly into the workspace
    const disposable3 = vscode.commands.registerCommand('codeToFlowchart.exportWorkspace', async () => {
        // Determine workspace folder (prefer root)
        let folderUri: vscode.Uri | undefined;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            folderUri = vscode.workspace.workspaceFolders[0].uri;
        } else if (vscode.window.activeTextEditor) {
            const fileUri = vscode.window.activeTextEditor.document.uri;
            folderUri = vscode.Uri.joinPath(fileUri, '..');
        } else {
            const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
            if (!selected || selected.length === 0) return;
            folderUri = selected[0];
        }

        if (!folderUri) {
            vscode.window.showErrorMessage('No folder found to scan.');
            return;
        }

        const folderPath = folderUri.fsPath;
        const folderName = path.basename(folderPath);

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating Flowchart and saving SVG', cancellable: false }, async (progress) => {
            progress.report({ increment: 0, message: 'Reading folder...' });
            try {
                const files = await readFolderRecursive(folderPath);
                if (files.length === 0) {
                    vscode.window.showWarningMessage('No code files found in the selected folder.');
                    return;
                }

                progress.report({ increment: 40, message: `Processing ${files.length} files...` });
                const mermaidCode = convertFolderToFlowchart(files, folderName);

                // Write the mermaid fenced file into the workspace root
                const outFile = path.join(folderPath, 'wholeflow.mmd');
                fs.writeFileSync(outFile, '```mermaid\n' + mermaidCode + '\n```\n', 'utf8');

                progress.report({ increment: 60, message: 'Exporting to SVG...' });

                // Export using an internal helper so the extension works when installed
                await runExportMermaid(folderPath);

                progress.report({ increment: 100, message: 'Opening SVG...' });

                const svgPath = path.join(folderPath, 'wholeflow.svg');
                const svgUri = vscode.Uri.file(svgPath);
                await vscode.commands.executeCommand('vscode.open', svgUri);

                vscode.window.showInformationMessage(`Exported flowchart to ${svgPath}`);
            } catch (err: any) {
                vscode.window.showErrorMessage('Error exporting flowchart: ' + (err && err.message ? err.message : String(err)));
            }
        });
    });

    context.subscriptions.push(disposable3);
}

async function runExportMermaid(folderPath: string): Promise<void> {
    const fsP = { readFile: util.promisify(fs.readFile), writeFile: util.promisify(fs.writeFile), access: util.promisify(fs.access), unlink: util.promisify(fs.unlink) } as any;
    const inputFenced = path.join(folderPath, 'wholeflow.mmd');
    const inputRaw = path.join(folderPath, 'wholeflow_raw.mmd');
    const outSvg = path.join(folderPath, 'wholeflow.svg');

    if (!fs.existsSync(inputFenced)) {
        throw new Error('wholeflow.mmd not found in the workspace root. Run generation first.');
    }

    const fenced = fs.readFileSync(inputFenced, 'utf8');
    const match = fenced.match(/```\s*mermaid\s*\n([\s\S]*?)\n```/i);
    let mermaidText = '';
    if (match && match[1]) mermaidText = match[1];
    else mermaidText = fenced.replace(/```/g, '').trim();

    if (!mermaidText || mermaidText.trim().length === 0) {
        throw new Error('No mermaid content found in wholeflow.mmd');
    }

    fs.writeFileSync(inputRaw, mermaidText, 'utf8');

    // temp config
    const tempConfig = path.join(folderPath, 'mmdc-temp-config.json');
    try {
        fs.writeFileSync(tempConfig, JSON.stringify({ maxTextSize: 1000000 }), 'utf8');
    } catch (e) {
        // non-fatal
    }

    // Try npm exec mmdc first
    const tryExec = () => new Promise<void>((resolve, reject) => {
        const child = spawn('npm', ['exec', '--', 'mmdc', '-i', inputRaw, '-o', outSvg, '--configFile', tempConfig], { cwd: folderPath, stdio: 'inherit', shell: true });
        child.on('error', (err) => reject(err));
        child.on('close', (code) => code === 0 ? resolve() : reject(new Error('npm exec mmdc failed with code ' + code)));
    });

    // Try local binary
    const tryLocal = () => new Promise<void>((resolve, reject) => {
        const localBin = path.join(folderPath, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');
        if (!fs.existsSync(localBin)) return reject(new Error('Local mmdc not found'));
        if (process.platform === 'win32') {
            const cmd = `"${localBin}" -i "${inputRaw}" -o "${outSvg}" --configFile "${tempConfig}"`;
            const child = spawn('cmd', ['/c', cmd], { cwd: folderPath, stdio: 'inherit', shell: true });
            child.on('error', (err) => reject(err));
            child.on('close', (code) => code === 0 ? resolve() : reject(new Error('local mmdc failed with code ' + code)));
        } else {
            const child = spawn(localBin, ['-i', inputRaw, '-o', outSvg, '--configFile', tempConfig], { cwd: folderPath, stdio: 'inherit' });
            child.on('error', (err) => reject(err));
            child.on('close', (code) => code === 0 ? resolve() : reject(new Error('local mmdc failed with code ' + code)));
        }
    });

    try {
        await tryExec();
    } catch (e1) {
        try {
            await tryLocal();
        } catch (e2) {
            // cleanup temp config
            try { if (fs.existsSync(tempConfig)) fs.unlinkSync(tempConfig); } catch (e) {}
            throw new Error('Failed to run Mermaid CLI automatically. Install @mermaid-js/mermaid-cli or use npx. ' + (e2 && (e2 as any).message ? (e2 as any).message : String(e2)));
        }
    }

    // cleanup temp config
    try { if (fs.existsSync(tempConfig)) fs.unlinkSync(tempConfig); } catch (e) {}

    return;
}

/**
 * Deactivates the extension
 */
export function deactivate() {
    // Clean up resources if needed
}

