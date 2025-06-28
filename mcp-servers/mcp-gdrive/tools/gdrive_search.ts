import { google } from "googleapis";
import { GDriveSearchInput, InternalToolResponse } from "./types.js";

export const schema = {
  name: "gdrive_search",
  description: "Search for files in Google Drive",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      pageToken: {
        type: "string",
        description: "Token for the next page of results",
        optional: true,
      },
      pageSize: {
        type: "number",
        description: "Number of results per page (max 100)",
        optional: true,
      },
    },
    required: ["query"],
  },
} as const;

export async function search(
  args: GDriveSearchInput,
): Promise<InternalToolResponse> {
  try {
    const drive = google.drive("v3");
    const userQuery = args.query.trim();
    let searchQuery = "";

    // If query is empty, list all files
    if (!userQuery) {
      searchQuery = "trashed = false";
    } else {
      // Escape special characters in the query
      const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

      // Build search query with multiple conditions
      const conditions = [];

      // Search in title
      conditions.push(`name contains '${escapedQuery}'`);

      // If specific file type is mentioned in query, add mimeType condition
      if (userQuery.toLowerCase().includes("sheet")) {
        conditions.push("mimeType = 'application/vnd.google-apps.spreadsheet'");
      } else if (userQuery.toLowerCase().includes("doc")) {
        conditions.push("mimeType = 'application/vnd.google-apps.document'");
      } else if (userQuery.toLowerCase().includes("folder")) {
        conditions.push("mimeType = 'application/vnd.google-apps.folder'");
      }

      searchQuery = `(${conditions.join(" or ")}) and trashed = false`;
    }

    const res = await drive.files.list({
      q: searchQuery,
      pageSize: args.pageSize || 10,
      pageToken: args.pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
    });

    const fileList = res.data.files
      ?.map((file: any) => `${file.id} ${file.name} (${file.mimeType})`)
      .join("\n");

    let response = `Found ${res.data.files?.length ?? 0} files:\n${fileList}`;

    // Add pagination info if there are more results
    if (res.data.nextPageToken) {
      response += `\n\nMore results available. Use pageToken: ${res.data.nextPageToken}`;
    }

    return {
      content: [
        {
          type: "text",
          text: response,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error("Error searching Google Drive:", error);
    
    // Handle specific Google API errors
    if (error instanceof Error) {
      const apiError = error as any;
      
      // Check for authentication errors
      if (apiError.code === 401 || apiError.message?.includes("unauthorized")) {
        return {
          content: [
            {
              type: "text",
              text: "Authentication error: Please ensure you are authenticated with Google Drive. You may need to restart the MCP server to re-authenticate.",
            },
          ],
          isError: true,
        };
      }
      
      // Check for permission errors
      if (apiError.code === 403) {
        return {
          content: [
            {
              type: "text",
              text: "Permission denied: You don't have access to perform this search. Please check your Google Drive permissions.",
            },
          ],
          isError: true,
        };
      }
      
      // Check for invalid query errors
      if (apiError.code === 400) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid search query: ${apiError.message || "Please check your search syntax."}`,
            },
          ],
          isError: true,
        };
      }
    }
    
    // Generic error response
    return {
      content: [
        {
          type: "text",
          text: `Error searching Google Drive: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        },
      ],
      isError: true,
    };
  }
}
