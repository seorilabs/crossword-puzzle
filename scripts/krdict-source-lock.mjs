import { createHash } from "node:crypto";

export const KRDIC_SOURCE_MIRROR = "spellcheck-ko/korean-dict-nikl-krdict";
export const KRDIC_SOURCE_COMMIT = "e7249562dca526461a347eb2cc5a2e67a17c4488";
export const KRDIC_SOURCE_BASE_URL = `https://raw.githubusercontent.com/${KRDIC_SOURCE_MIRROR}/${KRDIC_SOURCE_COMMIT}`;

const sourceArtifacts = [
  [
    "5000.xml",
    "c11b53abd04a53c503ec107b94003ed66276d0a8",
    "385992e097dde2780b1d07ea13d4054aeda3cec89274c3577571e25847243d02",
    33_518_435,
  ],
  [
    "10000.xml",
    "d345ec6a0d87b2809ea1feb6f6148ea8839025c7",
    "81c5dd78473795a13a92cf886f1928fa35e3c955643bb46c8bf620a98cd8f659",
    35_673_773,
  ],
  [
    "15000.xml",
    "d66c318e0d07f10da45634f0d6037820f1707afa",
    "dde06ca4b5247030a966589206aa1076c2b3f227870c2101536abbe14400bab7",
    36_392_804,
  ],
  [
    "20000.xml",
    "152c468c7fb2b1c75b7874c6f72712db80418504",
    "28cd04c09979dcacd6f1612e5896431cf75092146d3b1fa139cef2fa16a75e52",
    34_406_541,
  ],
  [
    "25000.xml",
    "9a865cab64ee88477eb3f7b4b07ccd0265423de2",
    "9eb85ba9f6ec6a12f40de3c74bf75c65fcdbaca2839b2f03c630f0b38616b09a",
    33_474_886,
  ],
  [
    "30000.xml",
    "96ffd985573462d22bc9ab3f13410bc5d8825ce8",
    "99ffc43c3609e03c839a7a8cceda4dbaf772069f56e03f8a43df8087c85cc77e",
    32_946_752,
  ],
  [
    "35000.xml",
    "3a3d45454ab3433cb750827249661de34cefff42",
    "6927e63b1be2c877a90ef5c12b74dcd33006debba5cd44137c0e329ddaa4e9cb",
    33_682_544,
  ],
  [
    "40000.xml",
    "78f2152f70bf432abac96217ad7fce2ea7aaaee0",
    "6d8f3789503b02a269b243669816500562a68c172653cb18abd99d99cf4dcc7d",
    33_052_228,
  ],
  [
    "45000.xml",
    "4514168fdcc081761972a646d11ae003a97519df",
    "96fa24bde66f87384d1fc6c386ce5670115fa4c06f40fb1a3a2834843db3cdea",
    33_812_290,
  ],
  [
    "50000.xml",
    "a2cd1fd3da83b5e12debab29c603a3911da37014",
    "1f491e995ed6fd9ebec2f0cfb2057faa270642532efbea07c924a54171e7fb8f",
    35_537_703,
  ],
  [
    "51947.xml",
    "a0f48359625e32b7490ac4cf08521772e3593d25",
    "71123ede933abaa8d7700fe665ee510656b04c5a2258d9f507b1d0d8f6e0e242",
    13_457_805,
  ],
];

export const KRDIC_SOURCE_ARTIFACTS = Object.freeze(
  sourceArtifacts.map(([file, gitBlobSha1, rawSha256, bytes]) =>
    Object.freeze({
      file,
      rawUrl: `${KRDIC_SOURCE_BASE_URL}/${file}`,
      bytes,
      rawSha256: `sha256:${rawSha256}`,
      gitBlobSha1,
    }),
  ),
);

export function calculateKrdictRawSha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function calculateKrdictGitBlobSha1(buffer) {
  return createHash("sha1")
    .update(`blob ${buffer.byteLength}\0`, "utf8")
    .update(buffer)
    .digest("hex");
}

export function verifyKrdictSourceArtifact(buffer, artifact) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError(`KRDIC artifact ${artifact.file} must be a Buffer`);
  }
  if (buffer.byteLength !== artifact.bytes) {
    throw new Error(
      `${artifact.file} byte length mismatch: expected ${artifact.bytes}, received ${buffer.byteLength}`,
    );
  }
  const rawSha256 = calculateKrdictRawSha256(buffer);
  if (rawSha256 !== artifact.rawSha256) {
    throw new Error(
      `${artifact.file} raw SHA-256 mismatch: expected ${artifact.rawSha256}, received ${rawSha256}`,
    );
  }
  const gitBlobSha1 = calculateKrdictGitBlobSha1(buffer);
  if (gitBlobSha1 !== artifact.gitBlobSha1) {
    throw new Error(
      `${artifact.file} Git blob SHA-1 mismatch: expected ${artifact.gitBlobSha1}, received ${gitBlobSha1}`,
    );
  }
}
