import { AZURE_CONFIGURED } from "@/lib/azure-auth";

export function GET() {
  return Response.json({ azure: AZURE_CONFIGURED });
}
