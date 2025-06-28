import fs from "fs";
import path from "path";
import type { InternalToolResponse } from "./types.js";

// Get credentials directory from environment variable or use default
const CREDS_DIR =
  process.env.GDRIVE_CREDS_DIR ||
  path.join(path.dirname(new URL(import.meta.url).pathname), "../../../../");

const credentialsPath = path.join(CREDS_DIR, ".gdrive-server-credentials.json");

export const schema = {
  name: "gdrive_deauthenticate",
  description: "Remove Google Drive authentication credentials and deauthenticate the server. After using this tool, the user must restart their MCP client/agent to re-authenticate.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
} as const;

export async function deauthenticate(): Promise<InternalToolResponse> {
    try {
      // Check if credentials file exists
      if (fs.existsSync(credentialsPath)) {
        // Remove the credentials file
        fs.unlinkSync(credentialsPath);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Google Drive credentials have been removed successfully.",
              action_required: "IMPORTANT: You must restart your MCP client/agent for the changes to take effect. The next time you use Google Drive tools, you will be prompted to authenticate again.",
              credentials_path: credentialsPath
            }, null, 2)
          }],
          isError: false
        };
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              message: "No credentials file found to remove.",
              credentials_path: credentialsPath
            }, null, 2)
          }],
          isError: false
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            message: "Failed to remove credentials file.",
            credentials_path: credentialsPath
          }, null, 2)
        }],
        isError: true
      };
    }
}