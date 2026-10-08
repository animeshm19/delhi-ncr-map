import { describe, expect, it } from "vitest";
import { checkLogo, sniffImage } from "@/lib/images";
import { logoUrl } from "@/lib/logos";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const html = new Uint8Array(Buffer.from("<html><script>alert(1)</script>"));

describe("logo checks", () => {
  it("recognises PNG, JPEG and WebP from their bytes", () => {
    expect(sniffImage(png)?.ext).toBe("png");
    expect(sniffImage(jpg)?.ext).toBe("jpg");
    expect(sniffImage(webp)?.ext).toBe("webp");
  });
  it("refuses SVG and HTML (they can carry scripts), whatever the file is called", () => {
    expect(checkLogo(svg).ok).toBe(false);
    expect(checkLogo(html).ok).toBe(false);
  });
  it("refuses empty and oversized files", () => {
    expect(checkLogo(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(png);
    expect(checkLogo(big).ok).toBe(false);
  });
});

describe("logoUrl", () => {
  it("builds a public storage URL for a valid path", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(logoUrl("spinny/logo.png?v=12")).toBe("https://abc.supabase.co/storage/v1/object/public/logos/spinny/logo.png?v=12");
  });
  it.each(["../secret.png", "spinny/logo.svg", "https://evil.example/x.png", "spinny/logo.png?v=1&x=<script>", null])(
    "returns nothing for %j",
    (p) => expect(logoUrl(p)).toBeNull(),
  );
});
