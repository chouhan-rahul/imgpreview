# 🤝 Contributing to Img Preview

Thank you for your interest in contributing to **Img Preview**! Whether you're reporting a bug, suggesting a feature, improving documentation, or submitting code, every contribution is welcome and appreciated.

We appreciate your time and effort in helping make Img Preview better!

---

## 🛠️ Development Setup

### 1. 📋 Prerequisites

Before you get started, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or newer).
- [Visual Studio Code](https://code.visualstudio.com/).
- [Git](https://git-scm.com/).

### 2. 📥 Getting the Code

Fork the repository on GitHub, then clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/imgpreview.git
cd imgpreview
npm install
```

### 3. 🚀 Running & Debugging in VS Code

1. Open the project root directory in VS Code.
2. Press **F5** or go to **Run and Debug → Run Extension**.
3. A new window titled `Extension Development Host` will launch with the extension loaded.
4. Open a file containing image references (e.g., HTML, CSS, JavaScript, TypeScript, or Markdown) to test gutter thumbnails and hover previews.

### 4. ✏️ Making Code Changes

- All extension source code lives in the `src/` directory.
- Recompile the extension bundle after making changes:

  ```bash
  npm run compile
  ```

- Alternatively, use watch mode during development:

  ```bash
  npm run watch
  ```

- In the Extension Development Host window, press `Ctrl + R` (Windows/Linux) or `Cmd + R` (macOS) to reload the extension.

---

## 🧪 Testing

Before submitting a pull request, make sure your changes build successfully and all relevant tests pass.

**Run the automated test suite:**

```bash
npm test
```

**Verify TypeScript types:**

```bash
npx tsc --noEmit
```

**Manual Testing Checklist:**

- Verify local image paths and relative path resolution.
- Test remote HTTP/HTTPS image previews.
- Check SVG, WebP, PNG, JPEG, and other supported formats.
- Verify Data URI previews.
- Test CSS `url()` references.
- Check gutter thumbnails and hover cards.
- Verify commands, context menu actions, and status bar behavior.

> 💡 **Testing Tip:** Test both valid and invalid image references, including missing files and unsupported formats.

---

## 📦 Pull Request Process

We welcome pull requests that improve functionality, fix bugs, optimize performance, or enhance documentation.

1. **Fork the repository** on GitHub.
2. **Create a feature branch** from the `main` branch:

   ```bash
   git checkout -b feature/my-cool-feature
   ```

3. **Make your changes** and ensure they follow the project's coding guidelines.
4. **Commit your changes** using clear, descriptive commit messages:

   ```bash
   git commit -m "feat: add support for AVIF image previews"
   ```

5. **Push your branch** to your fork:

   ```bash
   git push origin feature/my-cool-feature
   ```

6. **Open a Pull Request** against the original repository's `main` branch.
7. Provide a clear description of your changes and link any related issues.
8. Ensure all applicable GitHub Actions CI checks pass.

> ⚠️ **Important:** Keep pull requests focused on a single feature or bug fix whenever possible. Smaller pull requests are easier to review and maintain.

---

## 📜 Code Style Guidelines

To keep Img Preview fast, reliable, and maintainable, please follow these guidelines:

- **🧩 Keep It Modular:** Give each file, class, and function a clear responsibility.
- **💬 Document Complex Logic:** Add concise comments for non-obvious logic, complex regular expressions, and byte-reading operations.
- **🔒 Type Safety:** Avoid `any` wherever possible. Use appropriate TypeScript types and interfaces.
- **📚 Documentation:** Add or update relevant documentation when introducing new features or changing existing behavior.
- **⚡ Stay Lightweight:** Avoid unnecessary or heavy npm dependencies. Keep the production bundle as small as reasonably possible.
- **🚀 Performance Matters:** Keep scanning and hover operations efficient. Avoid blocking the editor, especially when handling large files.
- **🛡️ Handle Errors Gracefully:** Account for missing files, invalid paths, unsupported formats, and network failures.

---

## 🤝 Community & Policies

- **📖 Code of Conduct:** By participating in this project, you agree to follow our [Code of Conduct](https://github.com/chouhan-rahul/imgpreview/blob/main/CODE_OF_CONDUCT.md).
- **🔐 Security:** If you discover a security vulnerability, please report it privately according to our [Security Policy](https://github.com/chouhan-rahul/imgpreview/blob/main/SECURITY.md) instead of opening a public issue.
- **📜 License:** Contributions to Img Preview will be distributed under the project's [BSD 3-Clause License](https://github.com/chouhan-rahul/imgpreview/blob/main/LICENSE), subject to applicable copyright and licensing rights.

---

## 💖 Thank You!

Thank you for helping improve **Img Preview**!

Every contribution, whether big or small, helps make the extension better for everyone.

**Happy Coding!** 🚀