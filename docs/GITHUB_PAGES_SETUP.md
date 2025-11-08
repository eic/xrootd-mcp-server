# GitHub Pages Setup

This repository includes a GitHub Actions workflow that automatically deploys documentation to GitHub Pages.

## Enabling GitHub Pages

1. **Go to repository Settings**
   - Navigate to your repository on GitHub
   - Click **Settings** tab

2. **Enable GitHub Pages**
   - Scroll down to **Pages** section (under "Code and automation")
   - Under **Source**, select:
     - Source: **GitHub Actions**
   - Click **Save**

3. **Workflow will automatically run**
   - The workflow triggers on:
     - Push to `main` branch (for docs/, examples/USAGE.md, README.md, QUICKSTART.md)
     - Manual trigger via Actions tab
   - First deployment takes 2-3 minutes

4. **Access your documentation**
   - URL: `https://<username>.github.io/<repository-name>/`
   - Example: `https://your-username.github.io/xrootd-mcp-server/`

## What Gets Published

The GitHub Pages site includes:

- **Home Page**: Clean landing page with documentation links
- **README.html**: Project overview and features
- **QUICKSTART.html**: Installation and setup guide
- **docs/ADVANCED_FEATURES.html**: Advanced tool documentation
- **docs/CACHING.html**: Caching strategy details
- **examples/USAGE.html**: Usage examples and patterns

## Workflow Details

### Triggers

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'docs/**'
      - 'examples/USAGE.md'
      - 'README.md'
      - 'QUICKSTART.md'
      - '.github/workflows/docs.yml'
  workflow_dispatch:  # Manual trigger
```

### Build Process

1. **Checkout code**
2. **Install marked-cli** for Markdown → HTML conversion
3. **Create site structure**
   - Copy documentation files
   - Generate index.html landing page
   - Convert all .md files to .html with GitHub-style CSS
4. **Deploy to GitHub Pages**

### Styling

- Uses GitHub Markdown CSS for consistent rendering
- Dark mode support (follows system preference)
- Responsive design for mobile/desktop
- Navigation header on all pages

## Manual Trigger

To manually deploy documentation:

1. Go to **Actions** tab
2. Select **Deploy Documentation to GitHub Pages** workflow
3. Click **Run workflow** button
4. Select branch (main)
5. Click **Run workflow**

## Troubleshooting

### Pages not deploying

1. Check **Actions** tab for workflow errors
2. Verify GitHub Pages is enabled in Settings
3. Ensure branch is `main` (or update workflow)

### 404 errors on doc pages

- Check file paths in navigation links
- Ensure markdown files exist in docs/ and examples/
- Review workflow logs for conversion errors

### Styling issues

- GitHub Markdown CSS is loaded from CDN
- Dark mode requires browser support for `prefers-color-scheme`
- Verify internet connection for CDN resources

## Local Preview

To preview the site locally:

```bash
# Install marked-cli
npm install -g marked-cli

# Generate site
mkdir -p _site
cp -r docs _site/
mkdir -p _site/examples
cp examples/USAGE.md _site/examples/
cp README.md QUICKSTART.md _site/

# Convert markdown to HTML
for md in $(find _site -name "*.md"); do
    html="${md%.md}.html"
    marked "$md" > "$html"
done

# Serve with any static server
cd _site
python3 -m http.server 8000
# Open http://localhost:8000
```

## Customization

### Update Landing Page

Edit the `index.html` creation section in `.github/workflows/docs.yml`:

```yaml
cat > _site/index.html << 'EOF'
<!DOCTYPE html>
...
EOF
```

### Add New Documentation

1. Create markdown file in `docs/` or `examples/`
2. Add link to index.html
3. Commit and push to `main`
4. Workflow automatically updates site

### Change Styling

Modify the CSS in the HTML template sections of `.github/workflows/docs.yml`:

```yaml
<style>
  /* Your custom styles */
</style>
```

## Permissions

The workflow requires these permissions (already configured):

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

These allow the workflow to:
- Read repository content
- Deploy to GitHub Pages
- Authenticate with GitHub Pages service

## Further Reading

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions for Pages](https://github.com/actions/deploy-pages)
- [Marked CLI Documentation](https://marked.js.org/)
