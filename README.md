# Code to Flowchart - VS Code Extension

A VS Code extension that converts your code into interactive Mermaid flowcharts. Simply open any code file and generate a visual flowchart representation.

## Features

- 🎨 **Visual Flowcharts**: Convert any text-based code into Mermaid flowcharts
- 📊 **Interactive Diagrams**: View flowcharts directly in VS Code using WebView
- 🚀 **Quick Access**: Generate flowcharts with a single command
- 🔄 **Multi-language Support**: Works with JavaScript, TypeScript, Python, and any text-based code

## Installation

### From Source

1. Clone or download this repository
2. Open the folder in VS Code
3. Run the following commands:

```bash
npm install
npm run compile
```

4. Press `F5` to open a new Extension Development Host window
5. In the new window, open any code file
6. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
7. Run the command: **"Generate Flow Chart"**

## Usage

1. Open any code file in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette
3. Type "Generate Flow Chart" and select the command
4. The flowchart will appear in a new panel beside your editor

## How It Works

1. The extension reads the entire active file using the VS Code API
2. The code is passed to a conversion function that generates Mermaid flowchart syntax
3. The flowchart is rendered in a WebView panel using Mermaid.js
4. The diagram is displayed interactively in VS Code

## Extension Structure

```
.
├── src/
│   └── extension.ts      # Main extension code
├── media/
│   └── style.css         # WebView styling
├── out/                  # Compiled JavaScript (generated)
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm
- VS Code

### Building

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on changes)
npm run watch
```

### Testing

1. Press `F5` in VS Code to launch the Extension Development Host
2. Test the extension in the new window
3. Use `Ctrl+R` (or `Cmd+R` on Mac) to reload the extension

## Customization

The `convertToFlowchart()` function in `src/extension.ts` is a placeholder implementation. You can replace it with:

- A real code parser (AST-based)
- An AI-based code analysis tool
- Custom logic for specific languages
- Integration with external APIs

## Future Enhancements

- [ ] Support for multiple flowchart types (sequence, class diagrams, etc.)
- [ ] Language-specific parsing
- [ ] Export flowchart as image (PNG/SVG)
- [ ] Real-time updates when code changes
- [ ] Customizable flowchart themes

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

**Issue**: Extension doesn't appear in Command Palette
- **Solution**: Make sure you've compiled the extension (`npm run compile`) and reloaded the window

**Issue**: Flowchart doesn't render
- **Solution**: Check the Developer Console (`Help > Toggle Developer Tools`) for errors

**Issue**: WebView is blank
- **Solution**: Ensure you have an active file open before running the command

