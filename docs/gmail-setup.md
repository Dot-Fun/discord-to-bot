# Gmail MCP Setup Guide

This guide helps individual users connect their Gmail to Claude for email drafting assistance.

## Quick Setup

1. **Enable Gmail API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Gmail API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download credentials as JSON

2. **Install Gmail MCP**
   - Restart Claude after updating .mcp.json
   - The Gmail MCP will auto-install via npx

3. **First-time Authentication**
   - On first use, you'll be redirected to Google OAuth
   - Grant read-only permissions to Gmail
   - Authentication is stored securely for future use

## Available Features

### Read Emails
- Search emails by query
- Read specific emails
- List recent emails
- Download attachments

### Draft Assistance
Claude can help you:
- Draft replies based on email context
- Compose new emails
- Suggest improvements to drafts
- Format professional responses

## Usage Examples

```
User: "Read my latest emails from today"
Claude: [Retrieves and displays recent emails]

User: "Help me draft a reply to the project update email"
Claude: [Reads context and helps compose appropriate response]
```

## Privacy & Security

- **Read-only access**: Cannot send emails automatically
- **OAuth 2.0**: No passwords stored
- **Local storage**: Credentials stored in ~/.gmail-mcp/
- **User control**: Revoke access anytime via Google Account settings

## Troubleshooting

If Gmail MCP doesn't appear:
1. Restart Claude
2. Check ~/.gmail-mcp/ for credentials
3. Re-authenticate if needed

For support, check the RAD-22 ticket in JIRA.