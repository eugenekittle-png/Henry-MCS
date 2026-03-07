import {
  ND_CLIENT_ID,
  ND_AUTH_URL,
  ND_TOKEN_URL,
  getRedirectUri,
} from "@/lib/netdocuments/config";
import CallbackUrlInput from "./CallbackUrlInput";

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

function ParamRow({ name, value, highlight }: { name: string; value: string; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-yellow-50" : ""}>
      <td className="border border-gray-300 px-3 py-2 font-mono text-sm font-semibold bg-gray-50 w-48">
        {name}
      </td>
      <td className="border border-gray-300 px-3 py-2 font-mono text-sm break-all">{value}</td>
    </tr>
  );
}

export default async function NetDocumentsDebugPage({ searchParams }: Props) {
  const params = await searchParams;
  const { nd_error, nd_detail, nd_code, nd_tk, nd_expires } = params;

  const redirectUri = getRedirectUri();
  const tokenUrl = nd_tk || ND_TOKEN_URL;

  const exchangeParams = nd_code
    ? `code=${encodeURIComponent(nd_code)}${nd_tk ? `&tk=${encodeURIComponent(nd_tk)}` : ""}`
    : "";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NetDocuments OAuth Debug</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Step through the OAuth flow and inspect parameters at each stage.
      </p>

      {/* Step 1 */}
      <div className="mb-8 border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-blue-600 text-white text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center">
            1
          </span>
          <h2 className="text-lg font-semibold">Authorization Request (GET)</h2>
        </div>
        <p className="text-sm text-gray-500 mb-1">Endpoint:</p>
        <p className="font-mono text-sm text-blue-700 mb-4 break-all">{ND_AUTH_URL}</p>

        <p className="text-sm text-gray-500 mb-2">Query parameters:</p>
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Parameter</th>
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Value</th>
            </tr>
          </thead>
          <tbody>
            <ParamRow name="client_id" value={ND_CLIENT_ID} />
            <ParamRow name="scope" value="read" />
            <ParamRow name="response_type" value="code" />
            <ParamRow name="redirect_uri" value={redirectUri} />
            <ParamRow name="state" value="(random 32-byte hex, generated at runtime)" />
          </tbody>
        </table>

        <a
          href="/api/netdocuments/auth?returnUrl=/netdocuments-debug"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-medium text-sm"
        >
          Start Auth Flow →
        </a>

        <CallbackUrlInput />
      </div>

      {/* Step 2 */}
      <div className="mb-8 border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`text-white text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center ${nd_code ? "bg-blue-600" : "bg-gray-400"}`}
          >
            2
          </span>
          <h2 className="text-lg font-semibold">Token Exchange (POST)</h2>
          {!nd_code && <span className="text-xs text-gray-400">(complete Step 1 first)</span>}
          {nd_expires && (
            <span className="text-xs text-amber-600 font-medium">
              Code expires in {nd_expires}s — act quickly
            </span>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-1">Endpoint:</p>
        <p className="font-mono text-sm text-blue-700 mb-1 break-all">{tokenUrl}</p>
        {nd_tk && nd_tk !== ND_TOKEN_URL && (
          <p className="text-xs text-amber-600 mb-4">
            Using <code>tk</code> from callback (overrides default config URL)
          </p>
        )}
        {!nd_tk && <div className="mb-4" />}

        <p className="text-sm text-gray-500 mb-2">Headers:</p>
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Header</th>
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Value</th>
            </tr>
          </thead>
          <tbody>
            <ParamRow name="Content-Type" value="application/x-www-form-urlencoded" />
            <ParamRow name="Authorization" value={`Basic base64(${ND_CLIENT_ID}:<secret>)`} />
          </tbody>
        </table>

        <p className="text-sm text-gray-500 mb-2">Body:</p>
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Parameter</th>
              <th className="border border-gray-300 px-3 py-2 text-left text-sm">Value</th>
            </tr>
          </thead>
          <tbody>
            <ParamRow name="grant_type" value="authorization_code" />
            <ParamRow name="code" value={nd_code || "(received from callback)"} highlight={!!nd_code} />
            <ParamRow name="redirect_uri" value={redirectUri} />
          </tbody>
        </table>

        {nd_code && (
          <a
            href={`/api/netdocuments/debug-token?${exchangeParams}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded font-medium text-sm"
          >
            Exchange Token — view raw response →
          </a>
        )}
      </div>

      {/* Error result */}
      {(nd_error || nd_detail) && (
        <div className="border border-red-300 rounded-lg p-6 bg-red-50">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Error: {nd_error}</h2>
          {nd_detail && (
            <pre className="text-sm text-red-800 whitespace-pre-wrap bg-red-100 rounded p-3 overflow-auto">
              {decodeURIComponent(nd_detail)}
            </pre>
          )}
        </div>
      )}

      {/* Success result */}
      {!nd_error && params.success === "1" && (
        <div className="border border-green-300 rounded-lg p-6 bg-green-50">
          <h2 className="text-lg font-semibold text-green-700">Token exchange succeeded</h2>
          <p className="text-sm text-green-600 mt-1">Tokens have been stored in the session cookie.</p>
        </div>
      )}
    </div>
  );
}
