# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Compile the Extension
```bash
npm run compile
```

### Step 3: Run the Extension
1. Press `F5` in VS Code (or go to Run > Start Debugging)
2. A new Extension Development Host window will open
3. Open any code file in the new window
4. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
5. Type "Generate Flow Chart" and press Enter
6. The flowchart will appear in a panel beside your editor!

## 📝 Testing Checklist

- [ ] Extension compiles without errors
- [ ] Command appears in Command Palette
- [ ] Flowchart renders in WebView
- [ ] Works with different file types (JS, TS, Python, etc.)

## 🐛 Troubleshooting

**"Cannot find module 'vscode'"**
- Run `npm install` first

**Command not appearing**
- Make sure you compiled: `npm run compile`
- Reload the window: `Ctrl+R` or `Cmd+R`

**WebView is blank**
- Open a file first, then run the command
- Check Developer Tools: `Help > Toggle Developer Tools`

## 🎯 Next Steps

- Customize the `convertToFlowchart()` function in `src/extension.ts`
- Add language-specific parsing
- Integrate with AI services for better flowchart generation

