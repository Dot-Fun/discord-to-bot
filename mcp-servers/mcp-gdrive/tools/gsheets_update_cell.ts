import { google } from "googleapis";
import { GSheetsUpdateCellInput, InternalToolResponse } from "./types.js";

export const schema = {
  name: "gsheets_update_cell",
  description: "Update a cell value in a Google Spreadsheet",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the spreadsheet",
      },
      range: {
        type: "string",
        description: "Cell range in A1 notation (e.g. 'Sheet1!A1')",
      },
      value: {
        type: "string",
        description: "New cell value",
      },
    },
    required: ["fileId", "range", "value"],
  },
} as const;

export async function updateCell(
  args: GSheetsUpdateCellInput,
): Promise<InternalToolResponse> {
  try {
    const { fileId, range, value } = args;
    const sheets = google.sheets({ version: "v4" });

    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: range,
      valueInputOption: "RAW",
      requestBody: {
        values: [[value]],
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Updated cell ${range} to value: ${value}`,
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    console.error("Error updating Google Sheets cell:", error);
    
    // Handle specific Google API errors
    if (error.code === 404) {
      return {
        content: [
          {
            type: "text",
            text: `Spreadsheet not found: The spreadsheet with ID '${args.fileId}' does not exist or you don't have access to it.`,
          },
        ],
        isError: true,
      };
    }
    
    if (error.code === 401 || error.message?.includes("unauthorized")) {
      return {
        content: [
          {
            type: "text",
            text: "Authentication error: Please ensure you are authenticated with Google Sheets. You may need to restart the MCP server to re-authenticate.",
          },
        ],
        isError: true,
      };
    }
    
    if (error.code === 403) {
      return {
        content: [
          {
            type: "text",
            text: "Permission denied: You don't have permission to edit this spreadsheet.",
          },
        ],
        isError: true,
      };
    }
    
    if (error.code === 400) {
      const errorMsg = error.message || "";
      if (errorMsg.includes("range")) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid range: '${args.range}'. Please use A1 notation (e.g., 'Sheet1!A1' or 'A1:B2').`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Invalid request: ${errorMsg || "Please check your input parameters."}`,
          },
        ],
        isError: true,
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error updating cell: ${error.message || "Unknown error occurred"}`,
        },
      ],
      isError: true,
    };
  }
}

