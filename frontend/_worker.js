------formdata-undici-096663222799
Content-Disposition: form-data; name="metadata"

{"main_module":"functionsWorker-0.04163395278058346.js"}
------formdata-undici-096663222799
Content-Disposition: form-data; name="functionsWorker-0.04163395278058346.js"; filename="functionsWorker-0.04163395278058346.js"
Content-Type: application/javascript+module

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// lib/db.ts
function parseRankings(rankingsStr) {
  if (!rankingsStr) return {};
  const core = {};
  for (const pair of rankingsStr.split(",")) {
    const [source, value] = pair.split(":");
    if (source && value) {
      core[source.trim()] = value.trim();
    }
  }
  return core;
}
__name(parseRankings, "parseRankings");
async function getConferenceCount(db) {
  const result = await db.prepare("SELECT COUNT(*) as count FROM conferences").first();
  return result?.count ?? 0;
}
__name(getConferenceCount, "getConferenceCount");
async function getConferenceById(db, id) {
  console.log(id, "FAAR OUT");
  const result = await db.prepare(`
    SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
    FROM conferences c
    LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
    WHERE c.id = ?
    GROUP BY c.id
  `).bind(id).first();
  if (!result) return null;
  return {
    ...result,
    core: parseRankings(result.rankings)
  };
}
__name(getConferenceById, "getConferenceById");
async function getConferencesByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const results = await db.prepare(`
    SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
    FROM conferences c
    LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
    WHERE c.id IN (${placeholders})
    GROUP BY c.id
  `).bind(...ids).all();
  const confMap = new Map(
    results.results.map((c) => [c.id, { ...c, core: parseRankings(c.rankings) }])
  );
  return ids.map((id) => confMap.get(id)).filter((c) => c !== void 0);
}
__name(getConferencesByIds, "getConferencesByIds");
async function lexicalSearch(db, query, topK = 50) {
  const escapedQuery = query.replace(/['"]/g, "").trim();
  if (!escapedQuery) return [];
  const results = await db.prepare(`
    SELECT id, bm25(conferences_fts) as score
    FROM conferences_fts
    WHERE conferences_fts MATCH ?
    ORDER BY score
    LIMIT ?
  `).bind(escapedQuery, topK).all();
  return results.results.map((r) => ({
    id: r.id,
    score: -r.score
    // Negate so higher is better
  }));
}
__name(lexicalSearch, "lexicalSearch");
async function upsertUser(db, id, name, email) {
  await db.prepare(`
    INSERT INTO users (id, name, email)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      updated_at = datetime('now')
  `).bind(id, name, email, name, email).run();
}
__name(upsertUser, "upsertUser");
async function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}
__name(getUserById, "getUserById");
async function getUserFavorites(db, userId) {
  const results = await db.prepare(
    "SELECT conference_id FROM user_favorites WHERE user_id = ?"
  ).bind(userId).all();
  return results.results.map((r) => r.conference_id);
}
__name(getUserFavorites, "getUserFavorites");
async function isFavorited(db, userId, conferenceId) {
  const result = await db.prepare(
    "SELECT 1 FROM user_favorites WHERE user_id = ? AND conference_id = ?"
  ).bind(userId, conferenceId).first();
  return result !== null;
}
__name(isFavorited, "isFavorited");
async function addFavorite(db, userId, conferenceId) {
  await db.prepare(
    "INSERT OR IGNORE INTO user_favorites (user_id, conference_id) VALUES (?, ?)"
  ).bind(userId, conferenceId).run();
}
__name(addFavorite, "addFavorite");
async function removeFavorite(db, userId, conferenceId) {
  await db.prepare(
    "DELETE FROM user_favorites WHERE user_id = ? AND conference_id = ?"
  ).bind(userId, conferenceId).run();
}
__name(removeFavorite, "removeFavorite");
async function getPendingSubmissions(db) {
  const results = await db.prepare(
    "SELECT * FROM submitted_conferences WHERE status IN (?, ?) ORDER BY submitted_at DESC"
  ).bind("waiting", "approved").all();
  return results.results;
}
__name(getPendingSubmissions, "getPendingSubmissions");
async function getSubmissionById(db, id) {
  return db.prepare(
    "SELECT * FROM submitted_conferences WHERE id = ?"
  ).bind(id).first();
}
__name(getSubmissionById, "getSubmissionById");
async function updateSubmissionStatus(db, id, status, approvedAt) {
  if (approvedAt) {
    await db.prepare(
      "UPDATE submitted_conferences SET status = ?, approved_at = ? WHERE id = ?"
    ).bind(status, approvedAt, id).run();
  } else {
    await db.prepare(
      "UPDATE submitted_conferences SET status = ? WHERE id = ?"
    ).bind(status, id).run();
  }
}
__name(updateSubmissionStatus, "updateSubmissionStatus");
async function deleteSubmission(db, id) {
  await db.prepare("DELETE FROM submitted_conferences WHERE id = ?").bind(id).run();
}
__name(deleteSubmission, "deleteSubmission");
async function upsertConference(db, conference) {
  await db.prepare(`
    INSERT INTO conferences (id, title, acronym, city, country, deadline, notification, start_date, end_date, topics, url, h5_index, h5_median)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = ?,
      acronym = ?,
      city = ?,
      country = ?,
      deadline = ?,
      notification = ?,
      start_date = ?,
      end_date = ?,
      topics = ?,
      url = ?,
      h5_index = ?,
      h5_median = ?,
      updated_at = datetime('now')
  `).bind(
    conference.id,
    conference.title ?? conference.id,
    conference.acronym ?? conference.id,
    conference.city ?? null,
    conference.country ?? null,
    conference.deadline ?? null,
    conference.notification ?? null,
    conference.start_date ?? null,
    conference.end_date ?? null,
    conference.topics ?? null,
    conference.url ?? null,
    conference.h5_index ?? null,
    conference.h5_median ?? null,
    // For update
    conference.title ?? conference.id,
    conference.acronym ?? conference.id,
    conference.city ?? null,
    conference.country ?? null,
    conference.deadline ?? null,
    conference.notification ?? null,
    conference.start_date ?? null,
    conference.end_date ?? null,
    conference.topics ?? null,
    conference.url ?? null,
    conference.h5_index ?? null,
    conference.h5_median ?? null
  ).run();
}
__name(upsertConference, "upsertConference");
async function upsert_user_conf_rating(db, user_id, conference_id, ratings) {
  const ratingJson = JSON.stringify(ratings);
  await db.prepare(`
      INSERT INTO user_conf_rating (user_id, conference_id, ratings, updated_at)
      VALUES(?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, conference_id) DO UPDATE SET
        ratings = excluded.ratings,
        updated_at = datetime('now')
    `).bind(user_id, conference_id, ratingJson).run();
}
__name(upsert_user_conf_rating, "upsert_user_conf_rating");
async function get_user_conf_rating(db, user_id, conference_ids) {
  const ratingsByConfrence = {};
  for (const conference_id of conference_ids) {
    const result = await db.prepare(`
      SELECT ratings FROM user_conf_rating WHERE user_id = ? AND conference_id = ?
    `).bind(user_id, conference_id).first();
    if (result?.ratings) {
      ratingsByConfrence[conference_id] = JSON.parse(result.ratings);
    }
  }
  return ratingsByConfrence;
}
__name(get_user_conf_rating, "get_user_conf_rating");
async function upsert_user_profile(db, user_id, user_info) {
  const profileJson = JSON.stringify(user_info);
  await db.prepare(`
      INSERT INTO user_profile (user_id, user_profile, updated_at)
      VALUES(?,?, datetime("now"))
      ON CONFLICT(user_id) DO UPDATE SET
        -- excluded is a temp storage that keeps the valeus not entered in the conflict and adds them here.
        user_profile = excluded.user_profile,
        updated_at = datetime("now")
    `).bind(user_id, profileJson).run();
}
__name(upsert_user_profile, "upsert_user_profile");
async function get_user_profile(db, user_id) {
  const result = await db.prepare(`
    SELECT user_profile FROM user_profile WHERE user_id = ?
  `).bind(user_id).first();
  if (result?.user_profile) {
    return JSON.parse(result.user_profile);
  }
  return null;
}
__name(get_user_profile, "get_user_profile");
async function get_avg_user_overall_rating(db, conference_ids) {
  const avg_per_conf = {};
  for (const conference_id of conference_ids) {
    const row = await db.prepare(`
      SELECT AVG(json_extract(ratings, '$.overall')) AS average_overall
      FROM user_conf_rating
      WHERE conference_id = ?
    `).bind(conference_id).first();
    avg_per_conf[conference_id] = row?.average_overall ?? 0;
  }
  return avg_per_conf;
}
__name(get_avg_user_overall_rating, "get_avg_user_overall_rating");

// ../node_modules/jose/dist/browser/runtime/webcrypto.js
var webcrypto_default = crypto;
var isCryptoKey = /* @__PURE__ */ __name((key) => key instanceof CryptoKey, "isCryptoKey");

// ../node_modules/jose/dist/browser/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
__name(concat, "concat");

// ../node_modules/jose/dist/browser/runtime/base64url.js
var decodeBase64 = /* @__PURE__ */ __name((encoded) => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}, "decodeBase64");
var decode = /* @__PURE__ */ __name((input) => {
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}, "decode");

// ../node_modules/jose/dist/browser/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  constructor(message2, options) {
    super(message2, options);
    this.code = "ERR_JOSE_GENERIC";
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
JOSEError.code = "ERR_JOSE_GENERIC";
var JWTClaimValidationFailed = class extends JOSEError {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
JWTClaimValidationFailed.code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
var JWTExpired = class extends JOSEError {
  static {
    __name(this, "JWTExpired");
  }
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.code = "ERR_JWT_EXPIRED";
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
JWTExpired.code = "ERR_JWT_EXPIRED";
var JOSEAlgNotAllowed = class extends JOSEError {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JOSE_ALG_NOT_ALLOWED";
  }
};
JOSEAlgNotAllowed.code = "ERR_JOSE_ALG_NOT_ALLOWED";
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JOSE_NOT_SUPPORTED";
  }
};
JOSENotSupported.code = "ERR_JOSE_NOT_SUPPORTED";
var JWEDecryptionFailed = class extends JOSEError {
  static {
    __name(this, "JWEDecryptionFailed");
  }
  constructor(message2 = "decryption operation failed", options) {
    super(message2, options);
    this.code = "ERR_JWE_DECRYPTION_FAILED";
  }
};
JWEDecryptionFailed.code = "ERR_JWE_DECRYPTION_FAILED";
var JWEInvalid = class extends JOSEError {
  static {
    __name(this, "JWEInvalid");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JWE_INVALID";
  }
};
JWEInvalid.code = "ERR_JWE_INVALID";
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JWS_INVALID";
  }
};
JWSInvalid.code = "ERR_JWS_INVALID";
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JWT_INVALID";
  }
};
JWTInvalid.code = "ERR_JWT_INVALID";
var JWKInvalid = class extends JOSEError {
  static {
    __name(this, "JWKInvalid");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JWK_INVALID";
  }
};
JWKInvalid.code = "ERR_JWK_INVALID";
var JWKSInvalid = class extends JOSEError {
  static {
    __name(this, "JWKSInvalid");
  }
  constructor() {
    super(...arguments);
    this.code = "ERR_JWKS_INVALID";
  }
};
JWKSInvalid.code = "ERR_JWKS_INVALID";
var JWKSNoMatchingKey = class extends JOSEError {
  static {
    __name(this, "JWKSNoMatchingKey");
  }
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
    this.code = "ERR_JWKS_NO_MATCHING_KEY";
  }
};
JWKSNoMatchingKey.code = "ERR_JWKS_NO_MATCHING_KEY";
var JWKSMultipleMatchingKeys = class extends JOSEError {
  static {
    __name(this, "JWKSMultipleMatchingKeys");
  }
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
    this.code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  }
};
JWKSMultipleMatchingKeys.code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
var JWKSTimeout = class extends JOSEError {
  static {
    __name(this, "JWKSTimeout");
  }
  constructor(message2 = "request timed out", options) {
    super(message2, options);
    this.code = "ERR_JWKS_TIMEOUT";
  }
};
JWKSTimeout.code = "ERR_JWKS_TIMEOUT";
var JWSSignatureVerificationFailed = class extends JOSEError {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
    this.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  }
};
JWSSignatureVerificationFailed.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";

// ../node_modules/jose/dist/browser/lib/crypto_key.js
function unusable(name, prop = "algorithm.name") {
  return new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
}
__name(unusable, "unusable");
function isAlgorithm(algorithm, name) {
  return algorithm.name === name;
}
__name(isAlgorithm, "isAlgorithm");
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
__name(getHashLength, "getHashLength");
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
__name(getNamedCurve, "getNamedCurve");
function checkUsage(key, usages) {
  if (usages.length && !usages.some((expected) => key.usages.includes(expected))) {
    let msg = "CryptoKey does not support this operation, its usages must include ";
    if (usages.length > 2) {
      const last = usages.pop();
      msg += `one of ${usages.join(", ")}, or ${last}.`;
    } else if (usages.length === 2) {
      msg += `one of ${usages[0]} or ${usages[1]}.`;
    } else {
      msg += `${usages[0]}.`;
    }
    throw new TypeError(msg);
  }
}
__name(checkUsage, "checkUsage");
function checkSigCryptoKey(key, alg, ...usages) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "EdDSA": {
      if (key.algorithm.name !== "Ed25519" && key.algorithm.name !== "Ed448") {
        throw unusable("Ed25519 or Ed448");
      }
      break;
    }
    case "Ed25519": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usages);
}
__name(checkSigCryptoKey, "checkSigCryptoKey");

// ../node_modules/jose/dist/browser/lib/invalid_key_input.js
function message(msg, actual, ...types2) {
  types2 = types2.filter(Boolean);
  if (types2.length > 2) {
    const last = types2.pop();
    msg += `one of type ${types2.join(", ")}, or ${last}.`;
  } else if (types2.length === 2) {
    msg += `one of type ${types2[0]} or ${types2[1]}.`;
  } else {
    msg += `of type ${types2[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
__name(message, "message");
var invalid_key_input_default = /* @__PURE__ */ __name((actual, ...types2) => {
  return message("Key must be ", actual, ...types2);
}, "default");
function withAlg(alg, actual, ...types2) {
  return message(`Key for the ${alg} algorithm must be `, actual, ...types2);
}
__name(withAlg, "withAlg");

// ../node_modules/jose/dist/browser/runtime/is_key_like.js
var is_key_like_default = /* @__PURE__ */ __name((key) => {
  if (isCryptoKey(key)) {
    return true;
  }
  return key?.[Symbol.toStringTag] === "KeyObject";
}, "default");
var types = ["CryptoKey"];

// ../node_modules/jose/dist/browser/lib/is_disjoint.js
var isDisjoint = /* @__PURE__ */ __name((...headers) => {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}, "isDisjoint");
var is_disjoint_default = isDisjoint;

// ../node_modules/jose/dist/browser/lib/is_object.js
function isObjectLike(value) {
  return typeof value === "object" && value !== null;
}
__name(isObjectLike, "isObjectLike");
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
__name(isObject, "isObject");

// ../node_modules/jose/dist/browser/runtime/check_key_length.js
var check_key_length_default = /* @__PURE__ */ __name((alg, key) => {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}, "default");

// ../node_modules/jose/dist/browser/lib/is_jwk.js
function isJWK(key) {
  return isObject(key) && typeof key.kty === "string";
}
__name(isJWK, "isJWK");
function isPrivateJWK(key) {
  return key.kty !== "oct" && typeof key.d === "string";
}
__name(isPrivateJWK, "isPrivateJWK");
function isPublicJWK(key) {
  return key.kty !== "oct" && typeof key.d === "undefined";
}
__name(isPublicJWK, "isPublicJWK");
function isSecretJWK(key) {
  return isJWK(key) && key.kty === "oct" && typeof key.k === "string";
}
__name(isSecretJWK, "isSecretJWK");

// ../node_modules/jose/dist/browser/runtime/jwk_to_key.js
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
          algorithm = { name: "ECDSA", namedCurve: "P-256" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES384":
          algorithm = { name: "ECDSA", namedCurve: "P-384" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES512":
          algorithm = { name: "ECDSA", namedCurve: "P-521" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "EdDSA":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
__name(subtleMapping, "subtleMapping");
var parse = /* @__PURE__ */ __name(async (jwk) => {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const rest = [
    algorithm,
    jwk.ext ?? false,
    jwk.key_ops ?? keyUsages
  ];
  const keyData = { ...jwk };
  delete keyData.alg;
  delete keyData.use;
  return webcrypto_default.subtle.importKey("jwk", keyData, ...rest);
}, "parse");
var jwk_to_key_default = parse;

// ../node_modules/jose/dist/browser/runtime/normalize_key.js
var exportKeyValue = /* @__PURE__ */ __name((k) => decode(k), "exportKeyValue");
var privCache;
var pubCache;
var isKeyObject = /* @__PURE__ */ __name((key) => {
  return key?.[Symbol.toStringTag] === "KeyObject";
}, "isKeyObject");
var importAndCache = /* @__PURE__ */ __name(async (cache, key, jwk, alg, freeze = false) => {
  let cached = cache.get(key);
  if (cached?.[alg]) {
    return cached[alg];
  }
  const cryptoKey = await jwk_to_key_default({ ...jwk, alg });
  if (freeze)
    Object.freeze(key);
  if (!cached) {
    cache.set(key, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
}, "importAndCache");
var normalizePublicKey = /* @__PURE__ */ __name((key, alg) => {
  if (isKeyObject(key)) {
    let jwk = key.export({ format: "jwk" });
    delete jwk.d;
    delete jwk.dp;
    delete jwk.dq;
    delete jwk.p;
    delete jwk.q;
    delete jwk.qi;
    if (jwk.k) {
      return exportKeyValue(jwk.k);
    }
    pubCache || (pubCache = /* @__PURE__ */ new WeakMap());
    return importAndCache(pubCache, key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k)
      return decode(key.k);
    pubCache || (pubCache = /* @__PURE__ */ new WeakMap());
    const cryptoKey = importAndCache(pubCache, key, key, alg, true);
    return cryptoKey;
  }
  return key;
}, "normalizePublicKey");
var normalizePrivateKey = /* @__PURE__ */ __name((key, alg) => {
  if (isKeyObject(key)) {
    let jwk = key.export({ format: "jwk" });
    if (jwk.k) {
      return exportKeyValue(jwk.k);
    }
    privCache || (privCache = /* @__PURE__ */ new WeakMap());
    return importAndCache(privCache, key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k)
      return decode(key.k);
    privCache || (privCache = /* @__PURE__ */ new WeakMap());
    const cryptoKey = importAndCache(privCache, key, key, alg, true);
    return cryptoKey;
  }
  return key;
}, "normalizePrivateKey");
var normalize_key_default = { normalizePublicKey, normalizePrivateKey };

// ../node_modules/jose/dist/browser/key/import.js
async function importJWK(jwk, alg) {
  if (!isObject(jwk)) {
    throw new TypeError("JWK must be an object");
  }
  alg || (alg = jwk.alg);
  switch (jwk.kty) {
    case "oct":
      if (typeof jwk.k !== "string" || !jwk.k) {
        throw new TypeError('missing "k" (Key Value) Parameter value');
      }
      return decode(jwk.k);
    case "RSA":
      if ("oth" in jwk && jwk.oth !== void 0) {
        throw new JOSENotSupported('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
      }
    case "EC":
    case "OKP":
      return jwk_to_key_default({ ...jwk, alg });
    default:
      throw new JOSENotSupported('Unsupported "kty" (Key Type) Parameter value');
  }
}
__name(importJWK, "importJWK");

// ../node_modules/jose/dist/browser/lib/check_key_type.js
var tag = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((alg, key, usage) => {
  if (key.use !== void 0 && key.use !== "sig") {
    throw new TypeError("Invalid key for this operation, when present its use must be sig");
  }
  if (key.key_ops !== void 0 && key.key_ops.includes?.(usage) !== true) {
    throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${usage}`);
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, when present its alg must be ${alg}`);
  }
  return true;
}, "jwkMatchesOp");
var symmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage, allowJwk) => {
  if (key instanceof Uint8Array)
    return;
  if (allowJwk && isJWK(key)) {
    if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!is_key_like_default(key)) {
    throw new TypeError(withAlg(alg, key, ...types, "Uint8Array", allowJwk ? "JSON Web Key" : null));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
  }
}, "symmetricTypeCheck");
var asymmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage, allowJwk) => {
  if (allowJwk && isJWK(key)) {
    switch (usage) {
      case "sign":
        if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation be a private JWK`);
      case "verify":
        if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation be a public JWK`);
    }
  }
  if (!is_key_like_default(key)) {
    throw new TypeError(withAlg(alg, key, ...types, allowJwk ? "JSON Web Key" : null));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (usage === "sign" && key.type === "public") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
  }
  if (usage === "decrypt" && key.type === "public") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
  }
  if (key.algorithm && usage === "verify" && key.type === "private") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
  }
  if (key.algorithm && usage === "encrypt" && key.type === "private") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
  }
}, "asymmetricTypeCheck");
function checkKeyType(allowJwk, alg, key, usage) {
  const symmetric = alg.startsWith("HS") || alg === "dir" || alg.startsWith("PBES2") || /^A\d{3}(?:GCM)?KW$/.test(alg);
  if (symmetric) {
    symmetricTypeCheck(alg, key, usage, allowJwk);
  } else {
    asymmetricTypeCheck(alg, key, usage, allowJwk);
  }
}
__name(checkKeyType, "checkKeyType");
var check_key_type_default = checkKeyType.bind(void 0, false);
var checkKeyTypeWithJwk = checkKeyType.bind(void 0, true);

// ../node_modules/jose/dist/browser/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
__name(validateCrit, "validateCrit");
var validate_crit_default = validateCrit;

// ../node_modules/jose/dist/browser/lib/validate_algorithms.js
var validateAlgorithms = /* @__PURE__ */ __name((option, algorithms) => {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}, "validateAlgorithms");
var validate_algorithms_default = validateAlgorithms;

// ../node_modules/jose/dist/browser/runtime/subtle_dsa.js
function subtleDsa(alg, algorithm) {
  const hash = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash, name: "RSA-PSS", saltLength: alg.slice(-3) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
      return { name: "Ed25519" };
    case "EdDSA":
      return { name: algorithm.name };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
__name(subtleDsa, "subtleDsa");

// ../node_modules/jose/dist/browser/runtime/get_sign_verify_key.js
async function getCryptoKey(alg, key, usage) {
  if (usage === "sign") {
    key = await normalize_key_default.normalizePrivateKey(key, alg);
  }
  if (usage === "verify") {
    key = await normalize_key_default.normalizePublicKey(key, alg);
  }
  if (isCryptoKey(key)) {
    checkSigCryptoKey(key, alg, usage);
    return key;
  }
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalid_key_input_default(key, ...types));
    }
    return webcrypto_default.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  throw new TypeError(invalid_key_input_default(key, ...types, "Uint8Array", "JSON Web Key"));
}
__name(getCryptoKey, "getCryptoKey");

// ../node_modules/jose/dist/browser/runtime/verify.js
var verify = /* @__PURE__ */ __name(async (alg, key, signature, data) => {
  const cryptoKey = await getCryptoKey(alg, key, "verify");
  check_key_length_default(alg, cryptoKey);
  const algorithm = subtleDsa(alg, cryptoKey.algorithm);
  try {
    return await webcrypto_default.subtle.verify(algorithm, cryptoKey, signature, data);
  } catch {
    return false;
  }
}, "verify");
var verify_default = verify;

// ../node_modules/jose/dist/browser/jws/flattened/verify.js
async function flattenedVerify(jws, key, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!is_disjoint_default(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validate_crit_default(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validate_algorithms_default("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
    checkKeyTypeWithJwk(alg, key, "verify");
    if (isJWK(key)) {
      key = await importJWK(key, alg);
    }
  } else {
    checkKeyTypeWithJwk(alg, key, "verify");
  }
  const data = concat(encoder.encode(jws.protected ?? ""), encoder.encode("."), typeof jws.payload === "string" ? encoder.encode(jws.payload) : jws.payload);
  let signature;
  try {
    signature = decode(jws.signature);
  } catch {
    throw new JWSInvalid("Failed to base64url decode the signature");
  }
  const verified = await verify_default(alg, key, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    try {
      payload = decode(jws.payload);
    } catch {
      throw new JWSInvalid("Failed to base64url decode the payload");
    }
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key };
  }
  return result;
}
__name(flattenedVerify, "flattenedVerify");

// ../node_modules/jose/dist/browser/jws/compact/verify.js
async function compactVerify(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(compactVerify, "compactVerify");

// ../node_modules/jose/dist/browser/lib/epoch.js
var epoch_default = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "default");

// ../node_modules/jose/dist/browser/lib/secs.js
var minute = 60;
var hour = minute * 60;
var day = hour * 24;
var week = day * 7;
var year = day * 365.25;
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var secs_default = /* @__PURE__ */ __name((str) => {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}, "default");

// ../node_modules/jose/dist/browser/lib/jwt_claims_set.js
var normalizeTyp = /* @__PURE__ */ __name((value) => value.toLowerCase().replace(/^application\//, ""), "normalizeTyp");
var checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => {
  if (typeof audPayload === "string") {
    return audOption.includes(audPayload);
  }
  if (Array.isArray(audPayload)) {
    return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
  }
  return false;
}, "checkAudiencePresence");
var jwt_claims_set_default = /* @__PURE__ */ __name((protectedHeader, encodedPayload, options = {}) => {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload)) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
  }
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
  const presenceCheck = [...requiredClaims];
  if (maxTokenAge !== void 0)
    presenceCheck.push("iat");
  if (audience !== void 0)
    presenceCheck.push("aud");
  if (subject !== void 0)
    presenceCheck.push("sub");
  if (issuer !== void 0)
    presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse())) {
    if (!(claim in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs_default(options.clockTolerance);
      break;
    case "number":
      tolerance = options.clockTolerance;
      break;
    case "undefined":
      tolerance = 0;
      break;
    default:
      throw new TypeError("Invalid clockTolerance option type");
  }
  const { currentDate } = options;
  const now = epoch_default(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max = typeof maxTokenAge === "number" ? maxTokenAge : secs_default(maxTokenAge);
    if (age - tolerance > max) {
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
}, "default");

// ../node_modules/jose/dist/browser/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const verified = await compactVerify(jwt, key, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = jwt_claims_set_default(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(jwtVerify, "jwtVerify");

// ../node_modules/jose/dist/browser/jwks/local.js
function getKtyFromAlg(alg) {
  switch (typeof alg === "string" && alg.slice(0, 2)) {
    case "RS":
    case "PS":
      return "RSA";
    case "ES":
      return "EC";
    case "Ed":
      return "OKP";
    default:
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
  }
}
__name(getKtyFromAlg, "getKtyFromAlg");
function isJWKSLike(jwks) {
  return jwks && typeof jwks === "object" && Array.isArray(jwks.keys) && jwks.keys.every(isJWKLike);
}
__name(isJWKSLike, "isJWKSLike");
function isJWKLike(key) {
  return isObject(key);
}
__name(isJWKLike, "isJWKLike");
function clone(obj) {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}
__name(clone, "clone");
var LocalJWKSet = class {
  static {
    __name(this, "LocalJWKSet");
  }
  constructor(jwks) {
    this._cached = /* @__PURE__ */ new WeakMap();
    if (!isJWKSLike(jwks)) {
      throw new JWKSInvalid("JSON Web Key Set malformed");
    }
    this._jwks = clone(jwks);
  }
  async getKey(protectedHeader, token) {
    const { alg, kid } = { ...protectedHeader, ...token?.header };
    const kty = getKtyFromAlg(alg);
    const candidates = this._jwks.keys.filter((jwk2) => {
      let candidate = kty === jwk2.kty;
      if (candidate && typeof kid === "string") {
        candidate = kid === jwk2.kid;
      }
      if (candidate && typeof jwk2.alg === "string") {
        candidate = alg === jwk2.alg;
      }
      if (candidate && typeof jwk2.use === "string") {
        candidate = jwk2.use === "sig";
      }
      if (candidate && Array.isArray(jwk2.key_ops)) {
        candidate = jwk2.key_ops.includes("verify");
      }
      if (candidate) {
        switch (alg) {
          case "ES256":
            candidate = jwk2.crv === "P-256";
            break;
          case "ES256K":
            candidate = jwk2.crv === "secp256k1";
            break;
          case "ES384":
            candidate = jwk2.crv === "P-384";
            break;
          case "ES512":
            candidate = jwk2.crv === "P-521";
            break;
          case "Ed25519":
            candidate = jwk2.crv === "Ed25519";
            break;
          case "EdDSA":
            candidate = jwk2.crv === "Ed25519" || jwk2.crv === "Ed448";
            break;
        }
      }
      return candidate;
    });
    const { 0: jwk, length } = candidates;
    if (length === 0) {
      throw new JWKSNoMatchingKey();
    }
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys();
      const { _cached } = this;
      error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates) {
          try {
            yield await importWithAlgCache(_cached, jwk2, alg);
          } catch {
          }
        }
      };
      throw error;
    }
    return importWithAlgCache(this._cached, jwk, alg);
  }
};
async function importWithAlgCache(cache, jwk, alg) {
  const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk);
  if (cached[alg] === void 0) {
    const key = await importJWK({ ...jwk, ext: true }, alg);
    if (key instanceof Uint8Array || key.type !== "public") {
      throw new JWKSInvalid("JSON Web Key Set members must be public keys");
    }
    cached[alg] = key;
  }
  return cached[alg];
}
__name(importWithAlgCache, "importWithAlgCache");
function createLocalJWKSet(jwks) {
  const set = new LocalJWKSet(jwks);
  const localJWKSet = /* @__PURE__ */ __name(async (protectedHeader, token) => set.getKey(protectedHeader, token), "localJWKSet");
  Object.defineProperties(localJWKSet, {
    jwks: {
      value: /* @__PURE__ */ __name(() => clone(set._jwks), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return localJWKSet;
}
__name(createLocalJWKSet, "createLocalJWKSet");

// ../node_modules/jose/dist/browser/runtime/fetch_jwks.js
var fetchJwks = /* @__PURE__ */ __name(async (url, timeout, options) => {
  let controller;
  let id;
  let timedOut = false;
  if (typeof AbortController === "function") {
    controller = new AbortController();
    id = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
  }
  const response = await fetch(url.href, {
    signal: controller ? controller.signal : void 0,
    redirect: "manual",
    headers: options.headers
  }).catch((err) => {
    if (timedOut)
      throw new JWKSTimeout();
    throw err;
  });
  if (id !== void 0)
    clearTimeout(id);
  if (response.status !== 200) {
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  }
  try {
    return await response.json();
  } catch {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
}, "fetchJwks");
var fetch_jwks_default = fetchJwks;

// ../node_modules/jose/dist/browser/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers, "isCloudflareWorkers");
var USER_AGENT;
if (typeof navigator === "undefined" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) {
  const NAME = "jose";
  const VERSION = "v5.10.0";
  USER_AGENT = `${NAME}/${VERSION}`;
}
var jwksCache = Symbol();
function isFreshJwksCache(input, cacheMaxAge) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("uat" in input) || typeof input.uat !== "number" || Date.now() - input.uat >= cacheMaxAge) {
    return false;
  }
  if (!("jwks" in input) || !isObject(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isObject)) {
    return false;
  }
  return true;
}
__name(isFreshJwksCache, "isFreshJwksCache");
var RemoteJWKSet = class {
  static {
    __name(this, "RemoteJWKSet");
  }
  constructor(url, options) {
    if (!(url instanceof URL)) {
      throw new TypeError("url must be an instance of URL");
    }
    this._url = new URL(url.href);
    this._options = { agent: options?.agent, headers: options?.headers };
    this._timeoutDuration = typeof options?.timeoutDuration === "number" ? options?.timeoutDuration : 5e3;
    this._cooldownDuration = typeof options?.cooldownDuration === "number" ? options?.cooldownDuration : 3e4;
    this._cacheMaxAge = typeof options?.cacheMaxAge === "number" ? options?.cacheMaxAge : 6e5;
    if (options?.[jwksCache] !== void 0) {
      this._cache = options?.[jwksCache];
      if (isFreshJwksCache(options?.[jwksCache], this._cacheMaxAge)) {
        this._jwksTimestamp = this._cache.uat;
        this._local = createLocalJWKSet(this._cache.jwks);
      }
    }
  }
  coolingDown() {
    return typeof this._jwksTimestamp === "number" ? Date.now() < this._jwksTimestamp + this._cooldownDuration : false;
  }
  fresh() {
    return typeof this._jwksTimestamp === "number" ? Date.now() < this._jwksTimestamp + this._cacheMaxAge : false;
  }
  async getKey(protectedHeader, token) {
    if (!this._local || !this.fresh()) {
      await this.reload();
    }
    try {
      return await this._local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey) {
        if (this.coolingDown() === false) {
          await this.reload();
          return this._local(protectedHeader, token);
        }
      }
      throw err;
    }
  }
  async reload() {
    if (this._pendingFetch && isCloudflareWorkers()) {
      this._pendingFetch = void 0;
    }
    const headers = new Headers(this._options.headers);
    if (USER_AGENT && !headers.has("User-Agent")) {
      headers.set("User-Agent", USER_AGENT);
      this._options.headers = Object.fromEntries(headers.entries());
    }
    this._pendingFetch || (this._pendingFetch = fetch_jwks_default(this._url, this._timeoutDuration, this._options).then((json) => {
      this._local = createLocalJWKSet(json);
      if (this._cache) {
        this._cache.uat = Date.now();
        this._cache.jwks = json;
      }
      this._jwksTimestamp = Date.now();
      this._pendingFetch = void 0;
    }).catch((err) => {
      this._pendingFetch = void 0;
      throw err;
    }));
    await this._pendingFetch;
  }
};
function createRemoteJWKSet(url, options) {
  const set = new RemoteJWKSet(url, options);
  const remoteJWKSet = /* @__PURE__ */ __name(async (protectedHeader, token) => set.getKey(protectedHeader, token), "remoteJWKSet");
  Object.defineProperties(remoteJWKSet, {
    coolingDown: {
      get: /* @__PURE__ */ __name(() => set.coolingDown(), "get"),
      enumerable: true,
      configurable: false
    },
    fresh: {
      get: /* @__PURE__ */ __name(() => set.fresh(), "get"),
      enumerable: true,
      configurable: false
    },
    reload: {
      value: /* @__PURE__ */ __name(() => set.reload(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    },
    reloading: {
      get: /* @__PURE__ */ __name(() => !!set._pendingFetch, "get"),
      enumerable: true,
      configurable: false
    },
    jwks: {
      value: /* @__PURE__ */ __name(() => set._local?.jwks(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return remoteJWKSet;
}
__name(createRemoteJWKSet, "createRemoteJWKSet");

// lib/auth.ts
var jwksCache2 = null;
var jwksCacheDomain = null;
function getJWKS(domain) {
  if (jwksCache2 && jwksCacheDomain === domain) {
    return jwksCache2;
  }
  jwksCache2 = createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`)
  );
  jwksCacheDomain = domain;
  return jwksCache2;
}
__name(getJWKS, "getJWKS");
async function verifyToken(token, env) {
  try {
    const jwks = getJWKS(env.AUTH0_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE
    });
    return payload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}
__name(verifyToken, "verifyToken");
async function fetchUserInfo(token, env) {
  try {
    const response = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch user info:", error);
    return null;
  }
}
__name(fetchUserInfo, "fetchUserInfo");
async function extractUser(payload, token, env) {
  let name = payload.name;
  let email = payload.email;
  const nameIsEmail = name && name.includes("@");
  if (!name || !email || nameIsEmail) {
    const userInfo = await fetchUserInfo(token, env);
    console.log(userInfo, "CRINGEEEEEEEEEEEEEEE");
    name = userInfo?.nickname ?? userInfo?.name ?? name;
    email = userInfo?.email ?? email;
  }
  return {
    id: payload.sub,
    email,
    name
  };
}
__name(extractUser, "extractUser");
function extractBearerToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
__name(extractBearerToken, "extractBearerToken");
function unauthorizedResponse(message2 = "Unauthorized") {
  return new Response(
    JSON.stringify({ ok: false, error: message2 }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" }
    }
  );
}
__name(unauthorizedResponse, "unauthorizedResponse");
function forbiddenResponse(message2 = "Forbidden") {
  return new Response(
    JSON.stringify({ ok: false, error: message2 }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" }
    }
  );
}
__name(forbiddenResponse, "forbiddenResponse");
function isPublicPath(url, method) {
  const path = url.pathname;
  const publicGetPaths = [
    "/api/search",
    "/api/conferences/count"
  ];
  if (method === "GET") {
    if (publicGetPaths.includes(path)) {
      return true;
    }
    if (path.match(/^\/api\/conferences\/[^/]+$/)) {
      return true;
    }
  }
  return false;
}
__name(isPublicPath, "isPublicPath");

// api/admin/approve/[id].ts
var onRequestPost = /* @__PURE__ */ __name(async (context) => {
  const { env, data, params } = context;
  const user = data.user;
  const submissionId = params.id;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!submissionId) {
    return Response.json(
      { ok: false, error: "Missing submission ID" },
      { status: 400 }
    );
  }
  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== "admin") {
      return forbiddenResponse("Admin access required");
    }
    const submission = await getSubmissionById(env.DB, submissionId);
    if (!submission) {
      return Response.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }
    await updateSubmissionStatus(
      env.DB,
      submissionId,
      "approved",
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return Response.json({
      ok: true,
      message: "Submission approved"
    });
  } catch (error) {
    console.error("Admin approve API error:", error);
    return Response.json(
      { ok: false, error: "Failed to approve submission" },
      { status: 500 }
    );
  }
}, "onRequestPost");

// api/admin/reject/[id].ts
var onRequestDelete = /* @__PURE__ */ __name(async (context) => {
  const { env, data, params } = context;
  const user = data.user;
  const submissionId = params.id;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!submissionId) {
    return Response.json(
      { ok: false, error: "Missing submission ID" },
      { status: 400 }
    );
  }
  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== "admin") {
      return forbiddenResponse("Admin access required");
    }
    const submission = await getSubmissionById(env.DB, submissionId);
    if (!submission) {
      return Response.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }
    await deleteSubmission(env.DB, submissionId);
    return Response.json({
      ok: true,
      message: "Submission rejected and deleted"
    });
  } catch (error) {
    console.error("Admin reject API error:", error);
    return Response.json(
      { ok: false, error: "Failed to reject submission" },
      { status: 500 }
    );
  }
}, "onRequestDelete");

// api/admin/submissions.ts
var onRequestGet = /* @__PURE__ */ __name(async (context) => {
  const { env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== "admin") {
      return forbiddenResponse("Admin access required");
    }
    const submissions = await getPendingSubmissions(env.DB);
    return Response.json({ ok: true, submissions });
  } catch (error) {
    console.error("Admin submissions API error:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch submissions" },
      { status: 500 }
    );
  }
}, "onRequestGet");

// lib/openai.ts
var EMBEDDING_MODEL = "text-embedding-3-small";
async function getEmbedding(text, apiKey) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${error}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}
__name(getEmbedding, "getEmbedding");

// lib/vectorize.ts
async function vectorSearch(env, queryVector, topK = 50) {
  const results = await env.VECTORIZE_INDEX.query(queryVector, {
    topK,
    returnMetadata: "all"
  });
  return results.matches.map((match2) => ({
    id: match2.id,
    score: match2.score,
    metadata: match2.metadata
  }));
}
__name(vectorSearch, "vectorSearch");
async function upsertVector(env, id, vector, metadata) {
  await env.VECTORIZE_INDEX.upsert([
    {
      id,
      values: vector,
      metadata
    }
  ]);
}
__name(upsertVector, "upsertVector");

// api/admin/submit-all.ts
var onRequestPost2 = /* @__PURE__ */ __name(async (context) => {
  const { env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== "admin") {
      return forbiddenResponse("Admin access required");
    }
    const approved = await env.DB.prepare(
      "SELECT * FROM submitted_conferences WHERE status = 'approved'"
    ).all();
    if (approved.results.length === 0) {
      return Response.json({
        ok: true,
        message: "No approved submissions to publish",
        count: 0
      });
    }
    let publishedCount = 0;
    const errors = [];
    for (const submission of approved.results) {
      try {
        const embeddingText = [
          submission.conference_name,
          submission.topics,
          submission.city,
          submission.country
        ].filter(Boolean).join(" | ");
        const vector = await getEmbedding(embeddingText, env.OPENAI_API_KEY);
        await upsertConference(env.DB, {
          id: submission.id,
          title: submission.conference_name,
          acronym: submission.id,
          city: submission.city ?? void 0,
          country: submission.country ?? void 0,
          deadline: submission.deadline ?? void 0,
          start_date: submission.start_date ?? void 0,
          end_date: submission.end_date ?? void 0,
          topics: submission.topics ?? void 0,
          url: submission.url ?? void 0
        });
        const metadata = {
          id: submission.id,
          title: submission.conference_name,
          acronym: submission.id,
          city: submission.city ?? void 0,
          country: submission.country ?? void 0,
          deadline: submission.deadline ?? void 0,
          start_date: submission.start_date ?? void 0,
          end_date: submission.end_date ?? void 0
        };
        await upsertVector(env, submission.id, vector, metadata);
        await updateSubmissionStatus(env.DB, submission.id, "submitted");
        publishedCount++;
      } catch (error) {
        console.error(`Failed to publish ${submission.id}:`, error);
        errors.push(submission.id);
      }
    }
    return Response.json({
      ok: true,
      message: `Published ${publishedCount} conference(s)`,
      count: publishedCount,
      errors: errors.length > 0 ? errors : void 0
    });
  } catch (error) {
    console.error("Admin submit-all API error:", error);
    return Response.json(
      { ok: false, error: "Failed to publish conferences" },
      { status: 500 }
    );
  }
}, "onRequestPost");

// api/conferences/count.ts
var onRequestGet2 = /* @__PURE__ */ __name(async (context) => {
  const { env } = context;
  try {
    const count = await getConferenceCount(env.DB);
    return Response.json({ ok: true, count });
  } catch (error) {
    console.error("Count API error:", error);
    return Response.json(
      { ok: false, error: "Failed to get count" },
      { status: 500 }
    );
  }
}, "onRequestGet");

// api/conferences/submit.ts
var onRequestPost3 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const body = await request.json();
    const conferenceId = body.conference_id?.trim().toUpperCase();
    if (!conferenceId || !body.conference_name) {
      return Response.json(
        { ok: false, error: "Missing required fields: conference_id and conference_name" },
        { status: 400 }
      );
    }
    await env.DB.prepare(`
      INSERT INTO submitted_conferences
      (id, conference_name, city, country, deadline, start_date, end_date, topics, url,
       submitter_id, submitter_name, submitter_email, edit_type, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        conference_name = ?,
        city = ?,
        country = ?,
        deadline = ?,
        start_date = ?,
        end_date = ?,
        topics = ?,
        url = ?,
        submitter_id = ?,
        submitter_name = ?,
        submitter_email = ?,
        edit_type = ?,
        status = 'waiting',
        submitted_at = datetime('now')
    `).bind(
      conferenceId,
      body.conference_name,
      body.city ?? null,
      body.country ?? null,
      body.deadline ?? null,
      body.start ?? null,
      body.end ?? null,
      body.topics ?? null,
      body.url ?? null,
      user.id,
      user.name ?? null,
      user.email ?? null,
      body.edit_type ?? "new",
      // For ON CONFLICT UPDATE
      body.conference_name,
      body.city ?? null,
      body.country ?? null,
      body.deadline ?? null,
      body.start ?? null,
      body.end ?? null,
      body.topics ?? null,
      body.url ?? null,
      user.id,
      user.name ?? null,
      user.email ?? null,
      body.edit_type ?? "new"
    ).run();
    return Response.json({
      ok: true,
      message: "Conference submission received. It will be reviewed by an admin."
    });
  } catch (error) {
    console.error("Submit API error:", error);
    return Response.json(
      { ok: false, error: "Failed to submit conference" },
      { status: 500 }
    );
  }
}, "onRequestPost");

// api/conferences/[id].ts
var onRequestGet3 = /* @__PURE__ */ __name(async (context) => {
  const { env, params } = context;
  const rawId = params.id;
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!id) {
    return Response.json(
      { ok: false, error: "Missing conference ID" },
      { status: 400 }
    );
  }
  try {
    const conference = await getConferenceById(env.DB, id);
    if (!conference) {
      return Response.json(
        { ok: false, error: "Conference not found" },
        { status: 404 }
      );
    }
    return Response.json({ ok: true, conference });
  } catch (error) {
    console.error("Conference API error:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch conference" },
      { status: 500 }
    );
  }
}, "onRequestGet");

// api/favorites.ts
var onRequestPost4 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const body = await request.json();
    const conferenceId = body.conference_id;
    if (!conferenceId) {
      return Response.json(
        { ok: false, error: "Missing conference_id" },
        { status: 400 }
      );
    }
    const alreadyFavorited = await isFavorited(env.DB, user.id, conferenceId);
    if (alreadyFavorited) {
      await removeFavorite(env.DB, user.id, conferenceId);
      return Response.json({ ok: true, status: "removed" });
    } else {
      await addFavorite(env.DB, user.id, conferenceId);
      return Response.json({ ok: true, status: "added" });
    }
  } catch (error) {
    console.error("Favorites API error:", error);
    return Response.json(
      { ok: false, error: "Failed to update favorite" },
      { status: 500 }
    );
  }
}, "onRequestPost");

// api/profile.ts
var onRequestPost5 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const body = await request.json();
  upsert_user_profile(env.DB, user.id, body);
  console.log("upserted user page to db");
  return Response.json({ ok: true });
}, "onRequestPost");
var onRequestGet4 = /* @__PURE__ */ __name(async (context) => {
  const { env, data, request } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const profile = await get_user_profile(env.DB, user.id);
  return Response.json({ ok: true, profile });
}, "onRequestGet");

// api/search.ts
function rrfFuse(rankings, k = 50, c = 60, weights = [1, 1]) {
  const scores = /* @__PURE__ */ new Map();
  for (let listIdx = 0; listIdx < rankings.length; listIdx++) {
    const weight = weights[listIdx] ?? 1;
    for (let rank = 0; rank < rankings[listIdx].length; rank++) {
      const id = rankings[listIdx][rank].id;
      const current = scores.get(id) ?? 0;
      scores.set(id, current + weight * (1 / (c + rank + 1)));
    }
  }
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, k).map(([id]) => id);
}
__name(rrfFuse, "rrfFuse");
function applyFilters(results, params) {
  return results.filter((conf) => {
    if (params.location) {
      const loc = params.location.toLowerCase();
      const city = (conf.city ?? "").toLowerCase();
      const country = (conf.country ?? "").toLowerCase();
      if (!city.includes(loc) && !country.includes(loc)) {
        return false;
      }
    }
    if (params.date_span_first || params.date_span_second) {
      if (!conf.start_date) return false;
      const start = new Date(conf.start_date);
      if (params.date_span_first) {
        const filterStart = new Date(params.date_span_first);
        if (start < filterStart) return false;
      }
      if (params.date_span_second) {
        const filterEnd = new Date(params.date_span_second);
        if (start > filterEnd) return false;
      }
    }
    if (params.deadline_first || params.deadline_second) {
      if (!conf.deadline) return false;
      const deadline = new Date(conf.deadline);
      if (params.deadline_first) {
        const filterStart = new Date(params.deadline_first);
        if (deadline < filterStart) return false;
      }
      if (params.deadline_second) {
        const filterEnd = new Date(params.deadline_second);
        if (deadline > filterEnd) return false;
      }
    }
    if (params.ranking_source && params.ranking_score) {
      const core = conf.core ?? {};
      const rankOrder = { "A*": 4, A: 3, B: 2, C: 1 };
      if (params.ranking_source === "scholar") {
        const h5 = conf.h5_index ?? 0;
        const threshold = parseInt(params.ranking_score) || 0;
        if (h5 < threshold) return false;
      } else {
        const sourcePrefix = params.ranking_source.toUpperCase();
        const matchingKey = Object.keys(core).find(
          (k) => k.toUpperCase().startsWith(sourcePrefix)
        );
        if (!matchingKey) return false;
        const confRank = rankOrder[core[matchingKey]] ?? 0;
        const userRank = rankOrder[params.ranking_score] ?? 0;
        if (confRank < userRank) return false;
      }
    }
    return true;
  });
}
__name(applyFilters, "applyFilters");
var onRequestGet5 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const params = {
    query: url.searchParams.get("query") ?? "",
    search_type: url.searchParams.get("search_type") ?? "semantic",
    num_results: Math.min(parseInt(url.searchParams.get("num_results") ?? "10"), 100),
    location: url.searchParams.get("location") ?? void 0,
    ranking_source: url.searchParams.get("ranking_source") ?? void 0,
    ranking_score: url.searchParams.get("ranking_score") ?? void 0,
    date_span_first: url.searchParams.get("date_span_first") ?? void 0,
    date_span_second: url.searchParams.get("date_span_second") ?? void 0,
    deadline_first: url.searchParams.get("deadline_first") ?? void 0,
    deadline_second: url.searchParams.get("deadline_second") ?? void 0
  };
  if (!params.query.trim()) {
    return Response.json({ results: [], count: 0 });
  }
  let resultIds = [];
  try {
    if (params.search_type === "lexical") {
      const lexResults = await lexicalSearch(env.DB, params.query, 50);
      resultIds = lexResults.map((r) => r.id);
    } else if (params.search_type === "semantic") {
      const queryVector = await getEmbedding(params.query, env.OPENAI_API_KEY);
      const vecResults = await vectorSearch(env, queryVector, 50);
      resultIds = vecResults.map((r) => r.id);
    } else {
      const queryVector = await getEmbedding(params.query, env.OPENAI_API_KEY);
      const [lexResults, vecResults] = await Promise.all([
        lexicalSearch(env.DB, params.query, 50),
        vectorSearch(env, queryVector, 50)
      ]);
      resultIds = rrfFuse(
        [lexResults, vecResults.map((r) => ({ id: r.id, score: r.score }))],
        50,
        60,
        [1, 1]
      );
    }
    if (resultIds.length === 0) {
      return Response.json({ results: [], count: 0 });
    }
    let conferences = await getConferencesByIds(env.DB, resultIds);
    conferences = applyFilters(conferences, params);
    conferences = conferences.slice(0, params.num_results);
    return Response.json({
      results: conferences,
      count: conferences.length
    });
  } catch (error) {
    console.error("Search error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { ok: false, error: `Search failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}, "onRequestGet");

// api/user.ts
var onRequestGet6 = /* @__PURE__ */ __name(async (context) => {
  const { env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    await upsertUser(env.DB, user.id, user.name ?? null, user.email ?? null);
    const userRecord = await getUserById(env.DB, user.id);
    const favorites = await getUserFavorites(env.DB, user.id);
    return Response.json({
      ok: true,
      user: {
        id: userRecord?.id ?? user.id,
        name: userRecord?.name ?? user.name ?? null,
        email: userRecord?.email ?? user.email ?? null,
        privilege: userRecord?.privilege ?? "user"
      },
      favorites
    });
  } catch (error) {
    console.error("User API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    return Response.json(
      { ok: false, error: `Failed to fetch user data: ${errorMessage}`, stack: errorStack },
      { status: 500 }
    );
  }
}, "onRequestGet");

// api/user_conf_rating.ts
var onRequestPost6 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const body = await request.json();
  const conferenceId = body.conference_id;
  const { conference_id, ...bodyWithoutConferenceId } = body;
  upsert_user_conf_rating(env.DB, user.id, conferenceId, bodyWithoutConferenceId);
  console.log(typeof body, body);
  return Response.json({ ok: true });
}, "onRequestPost");
var onRequestGet7 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const url = new URL(request.url);
  const conferenceIdsParam = url.searchParams.get("conference_ids");
  if (!conferenceIdsParam) {
    return Response.json(
      { ok: false, error: "Missing conference ID" },
      { status: 400 }
    );
  }
  const conferenceIds = conferenceIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
  const ratings = await get_user_conf_rating(env.DB, user.id, conferenceIds);
  const avg_scores = await get_avg_user_overall_rating(env.DB, conferenceIds);
  return Response.json({ ok: true, ratings, avg_scores });
}, "onRequestGet");

// _middleware.ts
var onRequest = /* @__PURE__ */ __name(async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return next();
  }
  if (isPublicPath(url, request.method)) {
    return next();
  }
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse("Missing authorization token");
  }
  const payload = await verifyToken(token, env);
  if (!payload) {
    return unauthorizedResponse("Invalid or expired token");
  }
  data.user = await extractUser(payload, token, env);
  return next();
}, "onRequest");

// ../.wrangler/tmp/pages-HwQUzh/functionsRoutes-0.26297115488293143.mjs
var routes = [
  {
    routePath: "/api/admin/approve/:id",
    mountPath: "/api/admin/approve",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/admin/reject/:id",
    mountPath: "/api/admin/reject",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/admin/submissions",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/admin/submit-all",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/conferences/count",
    mountPath: "/api/conferences",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/conferences/submit",
    mountPath: "/api/conferences",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/conferences/:id",
    mountPath: "/api/conferences",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/favorites",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/profile",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/profile",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/search",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/user",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/user_conf_rating",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/user_conf_rating",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest],
    modules: []
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse2(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse2, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode2 = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode2(value, key);
        });
      } else {
        params[key.name] = decode2(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse2(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};

------formdata-undici-096663222799--
