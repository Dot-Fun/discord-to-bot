# Vendor Information

This directory contains a vendored copy of the mcp-gdrive MCP server.

## Source Information
- **Repository**: https://github.com/isaacphi/mcp-gdrive
- **Commit**: 8578949e3bf6d76dfc8707d5b91dca831bb089d7
- **Date**: 2025-06-27
- **License**: See LICENSE file

## Purpose
Vendored to maintain control over dependencies and prevent unexpected updates that could affect security or functionality.

## Modifications
- Removed .git directory
- Removed node_modules and package-lock.json (regenerate locally)
- Added this VENDOR_INFO.md file

## Build Instructions
```bash
npm install
npm run build
```