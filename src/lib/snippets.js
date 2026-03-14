/**
 * Generate code snippets for GraphQL requests in various languages
 */

export function generateSnippets(endpoint, query, variables = '{}', headers = '{}') {
    // Parse to ensure valid JSON and remove formatting for compact payloads
    let varsObj = {};
    let headersObj = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    try {
        if (variables && variables.trim()) {
            varsObj = JSON.parse(variables);
        }
    } catch (e) {
        // ignore
    }

    try {
        if (headers && headers.trim()) {
            const h = JSON.parse(headers);
            headersObj = { ...headersObj, ...h };
        }
    } catch (e) {
        // ignore
    }

    const payload = JSON.stringify({
        query: query || '',
        variables: varsObj
    });

    return {
        curl: generateCurl(endpoint, headersObj, payload),
        javascript: generateJavaScript(endpoint, headersObj, payload),
        python: generatePython(endpoint, headersObj, payload),
        php: generatePhp(endpoint, headersObj, payload),
        csharp: generateCSharp(endpoint, headersObj, payload)
    };
}

function generateCurl(endpoint, headers, payload) {
    let snippet = `curl -X POST '${endpoint}' \\\n`;
    for (const [key, value] of Object.entries(headers)) {
        snippet += `  -H '${key}: ${value}' \\\n`;
    }
    snippet += `  -d '${payload.replace(/'/g, "'\\''")}'`;
    return snippet;
}

function generateJavaScript(endpoint, headers, payload) {
    return `const url = "${endpoint}";

const headers = ${JSON.stringify(headers, null, 2)};

const payload = ${JSON.stringify(JSON.parse(payload), null, 2)};

fetch(url, {
  method: "POST",
  headers: headers,
  body: JSON.stringify(payload)
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error("Error:", error));
`;
}

function generatePython(endpoint, headers, payload) {
    return `import requests
import json

url = "${endpoint}"

headers = ${JSON.stringify(headers, null, 4)}

payload = ${JSON.stringify(JSON.parse(payload), null, 4)}

response = requests.post(url, headers=headers, json=payload)

print(response.json())
`;
}

function generatePhp(endpoint, headers, payload) {
    let headerStrings = Object.entries(headers).map(([k, v]) => `"${k}: ${v}"`);
    let headerArray = `[\n    ${headerStrings.join(',\n    ')}\n]`;

    return `<?php

$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => "${endpoint}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => "",
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => "POST",
  CURLOPT_POSTFIELDS => '${payload.replace(/'/g, "\\'")}',
  CURLOPT_HTTPHEADER => ${headerArray},
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
`;
}

function generateCSharp(endpoint, headers, payload) {
    return `using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace GraphQLClient
{
    class Program
    {
        static async Task Main(string[] args)
        {
            using (var client = new HttpClient())
            {
                var request = new HttpRequestMessage(HttpMethod.Post, "${endpoint}");
                
${Object.entries(headers)
            .filter(([k]) => k.toLowerCase() !== 'content-type') // Content-Type is set on the content
            .map(([k, v]) => `                request.Headers.Add("${k}", "${v}");`)
            .join('\n')}

                var content = new StringContent(
                    @"${payload.replace(/"/g, '""')}", 
                    Encoding.UTF8, 
                    "${headers['Content-Type'] || 'application/json'}"
                );
                
                request.Content = content;

                var response = await client.SendAsync(request);
                response.EnsureSuccessStatusCode();
                
                var responseBody = await response.Content.ReadAsStringAsync();
                Console.WriteLine(responseBody);
            }
        }
    }
}
`;
}
