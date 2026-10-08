// A local stand-in for the Supabase HTTP gateway, for end-to-end tests only.
//   /rest/v1/*     → proxied to a real PostgREST (so RLS and RPCs are the real thing)
//   /auth/v1/*     → a tiny GoTrue: magic-link sign-in (PKCE), /user, refresh, logout
//   /storage/v1/*  → uploads checked against storage.objects RLS as the caller, files on disk
//   /__e2e/*       → test hooks: read the last "email" sent to an address, set fake job boards
//   /__boards/*    → plays Greenhouse, Lever and Ashby's public job-board APIs
// Tokens are HS256 JWTs signed with the same secret PostgREST uses.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export function signJwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  const [h, b, s] = String(token ?? "").split(".");
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(b, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}

export function startGateway({ port, postgrestUrl, databaseUrl, jwtSecret, storageDir }) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const outbox = new Map(); // email -> last magic link
  const boards = new Map(); // "provider/handle" -> { status, body } for the fake job-board APIs
  const codes = new Map(); // auth code -> { email, challenge, method }
  const refresh = new Map(); // refresh token -> email
  fs.mkdirSync(storageDir, { recursive: true });

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  async function userFor(email) {
    const { rows } = await pool.query(
      "insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id, email, created_at",
      [email],
    );
    return rows[0];
  }

  async function session(email) {
    const user = await userFor(email);
    const now = Math.floor(Date.now() / 1000);
    const access_token = signJwt(
      { aud: "authenticated", role: "authenticated", sub: user.id, email: user.email, iat: now, exp: now + 3600 },
      jwtSecret,
    );
    const refresh_token = crypto.randomBytes(24).toString("base64url");
    refresh.set(refresh_token, email);
    return {
      access_token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token,
      user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: {}, user_metadata: {}, created_at: user.created_at },
    };
  }

  async function auth(req, res, url) {
    const p = url.pathname.replace("/auth/v1", "");
    if (p === "/otp" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const email = String(body.email ?? "").toLowerCase();
      if (!email.includes("@")) return json(res, 400, { msg: "invalid email" });
      const code = crypto.randomUUID();
      codes.set(code, { email, challenge: body.code_challenge, method: body.code_challenge_method });
      const redirect = new URL(String(url.searchParams.get("redirect_to") ?? body.options?.emailRedirectTo ?? body.redirect_to ?? "http://localhost:3100/auth/callback"));
      redirect.searchParams.set("code", code);
      outbox.set(email, redirect.toString());
      return json(res, 200, {});
    }
    if (p === "/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      if (grant === "pkce") {
        const entry = codes.get(body.auth_code);
        if (!entry) return json(res, 400, { error: "invalid_grant", error_description: "bad code" });
        codes.delete(body.auth_code);
        const hashed = crypto.createHash("sha256").update(String(body.code_verifier ?? "")).digest("base64url");
        const ok = entry.method?.toLowerCase() === "s256" ? hashed === entry.challenge : body.code_verifier === entry.challenge;
        if (!ok) return json(res, 400, { error: "invalid_grant", error_description: "verifier mismatch" });
        return json(res, 200, await session(entry.email));
      }
      if (grant === "refresh_token") {
        const email = refresh.get(body.refresh_token);
        if (!email) return json(res, 400, { error: "invalid_grant" });
        refresh.delete(body.refresh_token);
        return json(res, 200, await session(email));
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    if (p === "/user" && req.method === "GET") {
      const claims = verifyJwt(bearer(req), jwtSecret);
      if (!claims || claims.role !== "authenticated") return json(res, 401, { msg: "invalid JWT" });
      return json(res, 200, { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, app_metadata: {}, user_metadata: {} });
    }
    if (p === "/logout") {
      res.writeHead(204);
      return res.end();
    }
    return json(res, 404, { msg: "not found" });
  }

  async function storage(req, res, url) {
    const m = url.pathname.match(/^\/storage\/v1\/object\/(public\/)?([a-z0-9-]+)\/(.+)$/);
    if (!m) return json(res, 404, { error: "not found" });
    const [, isPublic, bucket, name] = m;
    if (name.includes("..")) return json(res, 400, { error: "bad path" });
    const file = path.join(storageDir, bucket, name);
    if (req.method === "GET" && isPublic) {
      const { rows } = await pool.query("select public from storage.buckets where id = $1", [bucket]);
      if (!rows[0]?.public || !fs.existsSync(file)) return json(res, 404, { error: "not found" });
      const meta = JSON.parse(fs.readFileSync(file + ".meta", "utf8"));
      res.writeHead(200, { "content-type": meta.contentType, "x-content-type-options": "nosniff" });
      return res.end(fs.readFileSync(file));
    }
    if ((req.method === "POST" || req.method === "PUT") && !isPublic) {
      const claims = verifyJwt(bearer(req), jwtSecret);
      if (!claims) return json(res, 401, { error: "unauthorized" });
      const body = await readBody(req);
      const contentType = req.headers["content-type"] ?? "application/octet-stream";
      const { rows } = await pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
      if (!rows[0]) return json(res, 404, { error: "bucket not found" });
      if (rows[0].file_size_limit && body.length > Number(rows[0].file_size_limit)) return json(res, 413, { error: "too large" });
      if (rows[0].allowed_mime_types && !rows[0].allowed_mime_types.includes(contentType)) return json(res, 415, { error: "mime" });
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${claims.role === "authenticated" ? "authenticated" : "anon"}`);
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await client.query(
          `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)
           on conflict (bucket_id, name) do update set metadata = excluded.metadata`,
          [bucket, name, claims.sub ?? null, { mimetype: contentType, size: body.length }],
        );
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        return json(res, 403, { error: "new row violates row-level security policy", message: String(e.message) });
      } finally {
        client.release();
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      fs.writeFileSync(file + ".meta", JSON.stringify({ contentType }));
      return json(res, 200, { Key: `${bucket}/${name}` });
    }
    return json(res, 405, { error: "method not allowed" });
  }

  function proxy(req, res, url) {
    const target = new URL(url.pathname.replace(/^\/rest\/v1/, "") + url.search, postgrestUrl);
    const headers = { ...req.headers, host: target.host };
    const up = http.request(target, { method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => json(res, 502, { message: "postgrest unavailable" }));
    req.pipe(up);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (url.pathname.startsWith("/rest/v1")) return proxy(req, res, url);
      if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url);
      if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url);
      if (url.pathname === "/__e2e/last-link") return json(res, 200, { link: outbox.get(String(url.searchParams.get("email")).toLowerCase()) ?? null });
      if (url.pathname === "/__e2e/health") return json(res, 200, { ok: true });
      // A page on another origin that frames the app's embed, for the embed test.
      if (url.pathname === "/__e2e/frame") {
        const src = url.searchParams.get("src") ?? "";
        if (!/^\/embed(\?[\w=&%-]*)?$/.test(src)) return json(res, 400, { error: "bad src" });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><title>Someone's blog</title><iframe src="http://localhost:3100${src.replace(/&/g, "&amp;")}" width="800" height="500"></iframe>`);
      }
      if (url.pathname === "/__e2e/boards" && req.method === "POST") {
        const { provider, handle, status = 200, body } = JSON.parse((await readBody(req)).toString() || "{}");
        boards.set(`${provider}/${handle}`, { status, body });
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/__boards/")) {
        const m =
          url.pathname.match(/^\/__boards\/(greenhouse)\/v1\/boards\/([^/]+)\/jobs$/) ??
          url.pathname.match(/^\/__boards\/(lever)\/v0\/postings\/([^/]+)$/) ??
          url.pathname.match(/^\/__boards\/(ashby)\/posting-api\/job-board\/([^/]+)$/);
        const board = m && boards.get(`${m[1]}/${decodeURIComponent(m[2])}`);
        if (!board) return json(res, 404, { error: "not found" });
        return json(res, board.status, board.body);
      }
      json(res, 404, { msg: "not found" });
    } catch (e) {
      json(res, 500, { msg: String(e?.message ?? e) });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, pool })));
}
