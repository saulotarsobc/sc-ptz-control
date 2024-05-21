# SC - PTZ Control 🏗️

---

<div align="center">
   <!-- <img alt="Build Status" src="https://img.shields.io/travis/saulotarsobc/scripts.svg"> -->
   <!-- <img alt="Test Coverage" src="https://img.shields.io/codecov/c/github/saulotarsobc/scripts.svg"> -->
   <img alt="Version" src="https://img.shields.io/github/v/release/saulotarsobc/sc-ptz-control">
   <!-- <img alt="Downloads" src="https://img.shields.io/npm/dt/package-name.svg"> -->
   <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow.svg">
   <img alt="Contributors" src="https://img.shields.io/github/contributors/saulotarsobc/sc-ptz-control">
   <img alt="Last Commit" src="https://img.shields.io/github/last-commit/saulotarsobc/sc-ptz-control">
   <img alt="Stars" src="https://img.shields.io/github/stars/saulotarsobc/sc-ptz-control">
</div>

---

![Alt text](./images/image.png)

## Help

- [@saulotarsobc](https://github.com/saulotarsobc)
  - [Template - Electronjs-with-Nextjs](https://github.com/saulotarsobc/Electronjs-with-Nextjs)
- [Intelbras](https://www.intelbras.com/pt-br/)
  - HTTP_API_V3.35_Intelbras
  - [URL RTSP - Intelbras Forum](https://forum.intelbras.com.br/viewtopic.php?t=56068)
  - [API - Dispositivos de Controle de Acesso Corporativo - Autenticação](https://intelbras-caco-api.intelbras.com.br/#autenticação)

## Alternativa
```ts
import crypto from "node:crypto";

export async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string
) {
  const authHeader = (
    method: any,
    uri: any,
    nonce: any,
    realm: any,
    qop: any,
    nc: any,
    cnonce: any,
    response: any
  ) => {
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  };

  const makeDigestResponse = (
    nonce: any,
    realm: any,
    qop: any,
    method: any,
    uri: any,
    nc: any,
    cnonce: any
  ) => {
    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    return md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  };

  const md5 = (str: string) => {
    // Replace this with an actual MD5 implementation or import from a library
    return crypto.createHash("md5").update(str).digest("hex");
  };

  // First request to get the WWW-Authenticate header
  const initialResponse = await fetch(url);
  if (!initialResponse.headers.has("www-authenticate")) {
    throw new Error("No www-authenticate header in the response");
  }

  const authHeaderStr: any = initialResponse.headers.get("www-authenticate");
  const authParams = authHeaderStr
    .substring(7)
    .split(", ")
    .reduce((acc: any, current: any) => {
      const [key, value] = current.split("=");
      acc[key] = value.replace(/"/g, "");
      return acc;
    }, {});

  const method = "GET";
  const uri = url.replace(/^.*\/\/[^\/]+/, ""); // Extract URI from the URL
  const nonce = authParams["nonce"];
  const realm = authParams["realm"];
  const qop = "auth";
  const nc = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 15);

  const responseHash = makeDigestResponse(
    nonce,
    realm,
    qop,
    method,
    uri,
    nc,
    cnonce
  );
  const authorization = authHeader(
    method,
    uri,
    nonce,
    realm,
    qop,
    nc,
    cnonce,
    responseHash
  );

  // Second request with the Digest authorization header
  const finalResponse = await fetch(url, {
    headers: {
      Authorization: authorization,
    },
  });

  if (!finalResponse.ok) {
    throw new Error(`HTTP error! status: ${finalResponse.status}`);
  }

  const buffer = await finalResponse.arrayBuffer();
  const base64String = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return "ok";
}

```

## React Native
```sh
npx expo install react-native-crypto-js;
```

```ts
import { MD5 } from "react-native-crypto-js";

/**
 * Calculates the MD5 hash of a given string.
 *
 * @param {string} str - The input string to be hashed.
 * @return {string} The MD5 hash of the input string.
 */
const md5 = (str: string): string => {
  return MD5(str).toString();
};

/**
 * Fetches a URL with Digest authentication.
 *
 * @param {string} url - The URL to fetch.
 * @param {string} username - The username for authentication.
 * @param {string} password - The password for authentication.
 * @return {Promise<string>} A promise that resolves to the base64-encoded response body.
 */
export async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string
): Promise<string> {
  const authHeader = (
    method: any,
    uri: any,
    nonce: any,
    realm: any,
    qop: any,
    nc: any,
    cnonce: any,
    response: any
  ) => {
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  };

  /**
   * Generates a digest response using the provided parameters.
   *
   * @param {any} nonce - The nonce value.
   * @param {any} realm - The realm value.
   * @param {any} qop - The qop value.
   * @param {any} method - The HTTP method.
   * @param {any} uri - The URI.
   * @param {any} nc - The nonce count.
   * @param {any} cnonce - The client nonce.
   * @return {string} The MD5 hash of the digest response.
   */
  const makeDigestResponse = (
    nonce: any,
    realm: any,
    qop: any,
    method: any,
    uri: any,
    nc: any,
    cnonce: any
  ): string => {
    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    return md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  };

  // Primeira solicitação para obter o cabeçalho WWW-Authenticate
  const initialResponse = await fetch(url);
  if (!initialResponse.headers.has("www-authenticate")) {
    throw new Error("No www-authenticate header in the response");
  }

  const authHeaderStr: any = initialResponse.headers.get("www-authenticate");
  const authParams = authHeaderStr
    .substring(7)
    .split(", ")
    .reduce((acc: any, current: any) => {
      const [key, value] = current.split("=");
      acc[key] = value.replace(/"/g, "");
      return acc;
    }, {});

  const method = "GET";
  const uri = url.replace(/^.*\/\/[^\/]+/, ""); // Extrai o URI do URL
  const nonce = authParams["nonce"];
  const realm = authParams["realm"];
  const qop = "auth";
  const nc = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 15);

  const responseHash = makeDigestResponse(
    nonce,
    realm,
    qop,
    method,
    uri,
    nc,
    cnonce
  );
  const authorization = authHeader(
    method,
    uri,
    nonce,
    realm,
    qop,
    nc,
    cnonce,
    responseHash
  );

  // Segunda solicitação com o cabeçalho de autorização Digest
  const finalResponse = await fetch(url, {
    headers: {
      Authorization: authorization,
    },
  });

  if (!finalResponse.ok) {
    throw new Error(`HTTP error! status: ${finalResponse.status}`);
  }

  const buffer = await finalResponse.arrayBuffer();
  const base64String = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64String;
}
```
