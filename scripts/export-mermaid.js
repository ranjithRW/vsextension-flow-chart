const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const root = process.cwd();
const inputFenced = path.join(root, 'wholeflow.mmd');
const inputRaw = path.join(root, 'wholeflow_raw.mmd');
const outSvg = path.join(root, 'wholeflow.svg');

if (!fs.existsSync(inputFenced)) {
    console.error('Error: wholeflow.mmd not found in the workspace root. Run `npm run generate-flow` first.');
    process.exit(1);
}

const fenced = fs.readFileSync(inputFenced, 'utf8');

// Strip triple-backtick fences and optional language marker
const match = fenced.match(/```\s*mermaid\s*\n([\s\S]*?)\n```/i);
let mermaidText = '';
if (match && match[1]) {
    mermaidText = match[1];
} else {
    // Fallback: try to remove any ``` fences
    mermaidText = fenced.replace(/```/g, '').trim();
}

if (!mermaidText || mermaidText.trim().length === 0) {
    console.error('No mermaid content found in wholeflow.mmd');
    process.exit(1);
}

fs.writeFileSync(inputRaw, mermaidText, 'utf8');
console.log('Wrote', inputRaw);

// Run mmdc via npx so users don't have to install globally
// Try to find a local mmdc binary first
const localMmdc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');
if (fs.existsSync(localMmdc)) {
    console.log('Found local mmdc at', localMmdc);
    const res = spawnSync(localMmdc, ['-i', inputRaw, '-o', outSvg], { stdio: 'inherit', shell: true });
    if (res.error) {
        console.error('Failed to run local mmdc:', res.error);
        process.exit(1);
    }
    if (res.status !== 0) {
        console.error('mmdc exited with code', res.status);
        process.exit(res.status || 1);
    }
    console.log('Generated SVG:', outSvg);
    process.exit(0);
}

// Try using npm exec (more likely present than npx)
console.log('Trying `npm exec mmdc` (this will download/run the CLI if necessary)...');
let res = spawnSync('npm', ['exec', '--', 'mmdc', '-i', inputRaw, '-o', outSvg], { stdio: 'inherit', shell: true });
if (!res.error && res.status === 0) {
    console.log('Generated SVG:', outSvg);
    process.exit(0);
}

console.error('\nFailed to run Mermaid CLI automatically.');
console.error('You can install it locally and run it, for example:');
console.error('  npm install -D @mermaid-js/mermaid-cli');
console.error('  npx mmdc -i wholeflow_raw.mmd -o wholeflow.svg');
process.exit(res && res.status ? res.status : 1);
